import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from "@/lib/calibration";
import { isIOS } from "@/lib/mobile";

export type DetectedCard = {
  xPct: number;
  yPct: number;
  wPct: number;
  score: number;
};

export type DetectedFinger = {
  xPct: number;
  yPct: number;
  dPct: number;
  landmarkIndex: number;
  /** 0–1 quality of width estimate */
  confidence: number;
};

const CARD_ASPECT = CARD_WIDTH_MM / CARD_HEIGHT_MM; // ~1.586
const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let handLandmarkerPromise: Promise<HandLandmarker> | null = null;

export function getHandLandmarker(): Promise<HandLandmarker> {
  if (!handLandmarkerPromise) {
    handLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
      return HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL,
          // GPU delegate crashes many iOS Safari tabs; CPU is slower but stable.
          delegate: isIOS() ? "CPU" : "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })();
  }
  return handLandmarkerPromise;
}

/** Ring finger landmark indices (MediaPipe 21-point hand). */
const RING_MCP = 13;
const RING_PIP = 14;
const RING_DIP = 15;
const RING_TIP = 16;
const MIDDLE_MCP = 9;
const MIDDLE_PIP = 10;

function dist(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  w: number,
  h: number
) {
  const dx = (a.x - b.x) * w;
  const dy = (a.y - b.y) * h;
  return Math.hypot(dx, dy);
}

function lerpLm(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  t: number
): NormalizedLandmark {
  return {
    x: a.x * (1 - t) + b.x * t,
    y: a.y * (1 - t) + b.y * t,
    z: (a.z ?? 0) * (1 - t) + (b.z ?? 0) * t,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

/** Middle of the proximal phalanx (MCP → PIP) — where a ring actually sits. */
function ringMeasureSeat(landmarks: NormalizedLandmark[]): NormalizedLandmark {
  const mcp = landmarks[RING_MCP];
  const pip = landmarks[RING_PIP];
  return lerpLm(mcp, pip, 0.5);
}

function fingerAxisUnit(
  mcp: NormalizedLandmark,
  tip: NormalizedLandmark,
  frameW: number,
  frameH: number
) {
  const dx = (tip.x - mcp.x) * frameW;
  const dy = (tip.y - mcp.y) * frameH;
  const len = Math.hypot(dx, dy) || 1;
  return { ax: dx / len, ay: dy / len, len };
}

/** How open/spread the hand is (0–1). Low = fist / overlapping fingers. */
function handOpenScore(landmarks: NormalizedLandmark[], frameW: number, frameH: number) {
  const tips = [8, 12, 16, 20]; // index, middle, ring, pinky tips
  const mcps = [5, 9, 13, 17];
  let spread = 0;
  for (let i = 0; i < tips.length; i++) {
    const tip = landmarks[tips[i]];
    const mcp = landmarks[mcps[i]];
    const ext = dist(mcp, tip, frameW, frameH) / Math.max(1, dist(landmarks[0], landmarks[9], frameW, frameH));
    spread += clamp(ext, 0, 1.2);
  }
  return clamp(spread / tips.length, 0, 1);
}

/**
 * Ring-finger circle at the PIP joint (just before the middle phalanx).
 * Diameter = measured finger width from pixels, guided by landmark geometry.
 */
export function detectFingerFromLandmarks(
  landmarks: NormalizedLandmark[],
  frameW: number,
  frameH: number,
  imageData?: ImageData | null
): DetectedFinger | null {
  if (landmarks.length < 21) return null;

  const mcp = landmarks[RING_MCP];
  const pip = landmarks[RING_PIP];
  const tip = landmarks[RING_TIP];
  const seat = ringMeasureSeat(landmarks);

  const axis = fingerAxisUnit(mcp, tip, frameW, frameH);
  const midMcp = landmarks[MIDDLE_MCP];
  const midPip = landmarks[MIDDLE_PIP];
  const pinkyMcp = landmarks[17];
  const pinkyPip = landmarks[18];

  const phalanxLen = dist(mcp, pip, frameW, frameH);
  // Half-gap to neighbors ≈ max half-width of this finger (stops bleed into middle/pinky)
  const gapToMiddle = Math.min(
    dist(mcp, midMcp, frameW, frameH),
    dist(pip, midPip, frameW, frameH)
  );
  const gapToPinky = Math.min(
    dist(mcp, pinkyMcp, frameW, frameH),
    dist(pip, pinkyPip, frameW, frameH)
  );
  const neighborHalfGap = Math.min(gapToMiddle, gapToPinky) * 0.5;

  // Anatomical prior: proximal ring width ≈ 60% of MCP→PIP bone length
  const priorPx = phalanxLen * 0.6;
  const minWidthPx = Math.max(phalanxLen * 0.42, frameW * 0.035);
  const maxWidthPx = Math.min(
    neighborHalfGap * 2.1,
    phalanxLen * 1.0,
    frameW * 0.18
  );

  let diameterPx = clamp(priorPx, minWidthPx, maxWidthPx);
  let scanConfidence = 0.35;

  if (imageData) {
    const refined = scanFingerWidthMulti(
      imageData,
      seat,
      axis,
      phalanxLen,
      minWidthPx,
      maxWidthPx
    );
    if (refined != null) {
      // Trust the pixel fit heavily — the prior only guards against blowups
      const t = clamp(refined.confidence, 0.6, 0.95);
      diameterPx = priorPx * (1 - t) + refined.widthPx * t;
      scanConfidence = refined.confidence;
    }
  }

  diameterPx = clamp(diameterPx, minWidthPx, maxWidthPx);

  const vis =
    ((mcp.visibility ?? 1) +
      (pip.visibility ?? 1) +
      (seat.visibility ?? 1)) /
    3;
  const open = handOpenScore(landmarks, frameW, frameH);
  const confidence = clamp(scanConfidence * 0.55 + vis * 0.3 + open * 0.15, 0, 1);

  return {
    xPct: seat.x * 100,
    yPct: seat.y * 100,
    dPct: clamp((diameterPx / frameW) * 100, 5, 18),
    landmarkIndex: RING_PIP,
    confidence,
  };
}

type WidthScan = { widthPx: number; confidence: number };

/**
 * Sample luminance across the finger, find left/right edges vs the desk.
 * Uses the dark-background drop-off (wood/mat) — not fragile skin-tone rules.
 */
function scanFingerWidthMulti(
  imageData: ImageData,
  seat: NormalizedLandmark,
  axis: { ax: number; ay: number; len: number },
  phalanxLen: number,
  minWidthPx: number,
  maxWidthPx: number
): WidthScan | null {
  const { width, height, data } = imageData;
  const px = seat.x * width;
  const py = seat.y * height;

  const nx = -axis.ay;
  const ny = axis.ax;

  // Sample lines spanning the proximal phalanx around the seat
  const offsets = [-0.2, -0.1, 0, 0.1, 0.2].map((f) => f * phalanxLen);
  const widths: number[] = [];
  const confs: number[] = [];

  for (const off of offsets) {
    const cx = px + axis.ax * off;
    const cy = py + axis.ay * off;
    const hit = scanFingerWidthAt(
      data,
      width,
      height,
      cx,
      cy,
      nx,
      ny,
      maxWidthPx
    );
    if (hit != null && hit.width >= minWidthPx * 0.7) {
      widths.push(hit.width);
      confs.push(hit.confidence);
    }
  }

  if (!widths.length) return null;

  widths.sort((a, b) => a - b);
  // 70th percentile — threshold cuts tend to under-measure, so lean wide
  // (still robust against one line leaking into the next finger)
  const pick = widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.7))];
  const conf = confs.reduce((a, b) => a + b, 0) / confs.length;
  return {
    widthPx: clamp(pick, minWidthPx, maxWidthPx),
    confidence: conf,
  };
}

function sampleLum(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= width || yi >= height) return 0;
  const i = (yi * width + xi) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

function scanFingerWidthAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  nx: number,
  ny: number,
  maxWidthPx: number
): { width: number; confidence: number } | null {
  // Scan far enough to reach desk on both sides of a normal finger
  const maxR = Math.round(
    Math.min(Math.min(width, height) * 0.12, maxWidthPx * 0.75 + 8)
  );
  if (maxR < 6) return null;

  const lum: number[] = [];
  for (let r = -maxR; r <= maxR; r++) {
    lum.push(sampleLum(data, width, height, cx + nx * r, cy + ny * r));
  }

  const center = maxR;
  const centerLum = lum[center];
  if (centerLum < 25) return null;

  // Background estimate from the outer ends of the scan (desk / wood)
  const bgLeft =
    (lum[0] + lum[1] + lum[2] + lum[Math.min(3, center - 1)]) / 4;
  const bgRight =
    (lum[lum.length - 1] +
      lum[lum.length - 2] +
      lum[lum.length - 3] +
      lum[Math.max(lum.length - 4, center + 1)]) /
    4;
  const bg = Math.min(bgLeft, bgRight);

  // Finger is brighter than dark desk — cut close to the desk level so the
  // full flesh width is captured (higher multipliers under-measure)
  const contrast = centerLum - bg;
  if (contrast < 14) return null;
  const threshold = bg + contrast * 0.3;

  let left = center;
  let right = center;
  for (let i = center; i >= 0; i--) {
    if (lum[i] < threshold) {
      left = i;
      break;
    }
    left = i;
  }
  for (let i = center; i < lum.length; i++) {
    if (lum[i] < threshold) {
      right = i;
      break;
    }
    right = i;
  }

  // Sub-pixel-ish: walk to the steepest drop near each edge (along the scan)
  left = refineEdge(lum, left, center, -1);
  right = refineEdge(lum, right, center, 1);

  const widthPx = right - left;
  if (widthPx < 4) return null;

  const contrastScore = clamp(contrast / 60, 0, 1);
  const sizeScore = clamp(widthPx / (maxWidthPx || widthPx), 0.2, 1);
  const confidence = clamp(0.35 + contrastScore * 0.4 + sizeScore * 0.2, 0.3, 0.95);
  return { width: widthPx, confidence };
}

/** Snap to the strongest luminance drop near a coarse edge. */
function refineEdge(
  lum: number[],
  edge: number,
  center: number,
  dir: -1 | 1
): number {
  const start = clamp(edge - dir * 2, 0, lum.length - 1);
  const end = clamp(edge + dir * 3, 0, lum.length - 1);
  let best = edge;
  let bestDrop = -1;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let i = lo; i < hi; i++) {
    const drop = Math.abs(lum[i + 1] - lum[i]);
    // Prefer drops that move away from the bright finger core
    const towardBg = dir < 0 ? lum[i] > lum[i + 1] : lum[i] < lum[i + 1];
    if (towardBg && drop > bestDrop) {
      bestDrop = drop;
      best = dir < 0 ? i + 1 : i;
    }
  }
  // Keep edge on the finger side of center
  if (dir < 0) return Math.min(best, center);
  return Math.max(best, center);
}

/** Legacy single-line scan (fallback). */
function loadImageFromDataUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

let handLandmarkerImagePromise: Promise<HandLandmarker> | null = null;

function getHandLandmarkerImage(): Promise<HandLandmarker> {
  if (!handLandmarkerImagePromise) {
    handLandmarkerImagePromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
      return HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL,
          delegate: isIOS() ? "CPU" : "GPU",
        },
        runningMode: "IMAGE",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })();
  }
  return handLandmarkerImagePromise;
}

/** High-res finger detect on a captured still (more accurate width than live preview). */
export async function detectFingerFromPhoto(
  dataUrl: string
): Promise<DetectedFinger | null> {
  const img = await loadImageFromDataUrl(dataUrl);
  const maxW = 960;
  const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
  const w = Math.round((img.naturalWidth || maxW) * scale);
  const h = Math.round((img.naturalHeight || maxW) * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const landmarker = await getHandLandmarkerImage();
  const result = landmarker.detect(canvas);
  if (!result.landmarks?.[0]) return null;
  return detectFingerFromLandmarks(result.landmarks[0], w, h, imageData);
}

/** EMA-smooth finger circle so it doesn't jitter frame-to-frame. */
export function smoothFinger(
  prev: DetectedFinger | null,
  next: DetectedFinger | null,
  alpha = 0.38
): DetectedFinger | null {
  if (!next) return prev;
  if (!prev) return next;
  return {
    xPct: prev.xPct * (1 - alpha) + next.xPct * alpha,
    yPct: prev.yPct * (1 - alpha) + next.yPct * alpha,
    dPct: prev.dPct * (1 - alpha) + next.dPct * alpha,
    landmarkIndex: next.landmarkIndex,
    confidence: prev.confidence * (1 - alpha) + next.confidence * alpha,
  };
}

/**
 * Heuristic fallback when OpenCV is unavailable or finds nothing.
 */
function detectCardRectHeuristic(
  imageData: ImageData,
  exclude?: { xPct: number; yPct: number; rPct: number } | null,
  opts?: { relaxed?: boolean }
): DetectedCard | null {
  const relaxed = opts?.relaxed ?? false;
  const { data, width, height } = imageData;

  const luma = new Float32Array(width * height);
  const chroma = new Float32Array(width * height); // approx saturation
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    luma[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    chroma[p] = max === 0 ? 0 : (max - min) / max;
  }

  // Local variance via box blur of luma and luma² (integral images)
  const integralL = buildIntegral(luma, width, height);
  const integralL2 = buildIntegral(
    luma.map((v) => v * v),
    width,
    height
  );
  const integralC = buildIntegral(chroma, width, height);

  // Edge magnitude for border contrast (cheap Sobel)
  const edge = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -luma[i - width - 1] +
        luma[i - width + 1] -
        2 * luma[i - 1] +
        2 * luma[i + 1] -
        luma[i + width - 1] +
        luma[i + width + 1];
      const gy =
        -luma[i - width - 1] -
        2 * luma[i - width] -
        luma[i - width + 1] +
        luma[i + width - 1] +
        2 * luma[i + width] +
        luma[i + width + 1];
      edge[i] = Math.hypot(gx, gy);
    }
  }
  const integralE = buildIntegral(edge, width, height);

  const mean = (
    integ: Float32Array,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ) => {
    const area = Math.max(1, (x1 - x0) * (y1 - y0));
    return rectSum(integ, width, x0, y0, x1, y1) / area;
  };

  let best: DetectedCard | null = null;
  let bestScore = -Infinity;

  const minW = Math.floor(width * (relaxed ? 0.18 : 0.22));
  const maxW = Math.floor(width * (relaxed ? 0.78 : 0.7));
  const step = Math.max(2, Math.floor(width / (relaxed ? 36 : 48)));

  // Prefer searching the right side (card placement guide)
  const xStart = Math.floor(width * (relaxed ? 0.15 : 0.28));

  for (let w = minW; w <= maxW; w += step) {
    for (const aspect of [CARD_ASPECT, CARD_ASPECT * 0.92, CARD_ASPECT * 1.08]) {
      const h = Math.round(w / aspect);
      if (h < height * 0.1 || h > height * 0.5) continue;

      for (let y = step; y <= height - h - step; y += step) {
        for (let x = xStart; x <= width - w - step; x += step) {
          const cxPct = ((x + w / 2) / width) * 100;
          const cyPct = ((y + h / 2) / height) * 100;

          if (exclude) {
            const dx = cxPct - exclude.xPct;
            const dy = cyPct - exclude.yPct;
            if (Math.hypot(dx, dy) < exclude.rPct) continue;
          }

          const pad = Math.max(2, Math.floor(Math.min(w, h) * 0.06));
          const ix0 = x + pad;
          const iy0 = y + pad;
          const ix1 = x + w - pad;
          const iy1 = y + h - pad;
          if (ix1 <= ix0 + 4 || iy1 <= iy0 + 4) continue;

          const area = (ix1 - ix0) * (iy1 - iy0);
          const sumL = rectSum(integralL, width, ix0, iy0, ix1, iy1);
          const sumL2 = rectSum(integralL2, width, ix0, iy0, ix1, iy1);
          const meanL = sumL / area;
          const varL = Math.max(0, sumL2 / area - meanL * meanL);
          const stdL = Math.sqrt(varL);
          const meanCh = mean(integralC, ix0, iy0, ix1, iy1);

          // Quiet face = card; busy map texture = high std
          if (stdL > (relaxed ? 48 : 38)) continue;
          // Too dark/empty (just mat hole)
          if (meanL < (relaxed ? 22 : 28)) continue;

          // Border ring just outside the window (contrast vs surroundings)
          const ox0 = Math.max(0, x - pad);
          const oy0 = Math.max(0, y - pad);
          const ox1 = Math.min(width, x + w + pad);
          const oy1 = Math.min(height, y + h + pad);
          const outerArea = Math.max(1, (ox1 - ox0) * (oy1 - oy0) - area);
          const outerSum =
            rectSum(integralL, width, ox0, oy0, ox1, oy1) - sumL;
          const meanOuter = outerSum / outerArea;
          const contrast = Math.abs(meanL - meanOuter);

          if (contrast < (relaxed ? 8 : 12)) continue;

          // Edge energy on the perimeter only (4 bands)
          const band = Math.max(1, Math.floor(pad * 0.9));
          const periEdges =
            rectSum(integralE, width, x, y, x + w, y + band) +
            rectSum(integralE, width, x, y + h - band, x + w, y + h) +
            rectSum(integralE, width, x, y, x + band, y + h) +
            rectSum(integralE, width, x + w - band, y, x + w, y + h);
          const periLen = 2 * (w + h) * band;
          const borderEdge = periEdges / Math.max(1, periLen);

          // Interior edge energy — MUST stay low (rejects map)
          const interiorEdge = mean(integralE, ix0, iy0, ix1, iy1);
          if (interiorEdge > (relaxed ? 52 : 42)) continue;

          // Right-side preference
          const rightBias = cxPct / 100;

          // Prefer some chroma (colored bank cards) but allow grey/metal
          const chromaBoost = meanCh > 0.12 ? 1.15 : 1;

          const uniformity = 1 / (1 + stdL / 10);
          const score =
            (contrast * 1.4 + borderEdge * 0.8) *
              uniformity *
              chromaBoost *
              (0.65 + 0.35 * rightBias) -
            interiorEdge * 0.9;

          if (score > bestScore) {
            bestScore = score;
            best = {
              xPct: cxPct,
              yPct: cyPct,
              wPct: (w / width) * 100,
              score,
            };
          }
        }
      }
    }
  }

  // Require a meaningful score so we don't fake a lock
  if (!best || best.score < (relaxed ? 5 : 8)) return null;
  return best;
}

function buildIntegral(
  src: Float32Array | number[],
  width: number,
  height: number
): Float32Array {
  const out = new Float32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y++) {
    let row = 0;
    for (let x = 1; x <= width; x++) {
      row += src[(y - 1) * width + (x - 1)];
      out[y * (width + 1) + x] = out[(y - 1) * (width + 1) + x] + row;
    }
  }
  return out;
}

function rectSum(
  integral: Float32Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
) {
  const W = width + 1;
  return (
    integral[y1 * W + x1] -
    integral[y0 * W + x1] -
    integral[y1 * W + x0] +
    integral[y0 * W + x0]
  );
}

export function grabVideoFrame(
  video: HTMLVideoElement,
  maxWidth = 360
): {
  canvas: HTMLCanvasElement;
  imageData: ImageData;
  frameW: number;
  frameH: number;
} | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const scale = Math.min(1, maxWidth / vw);
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return {
    canvas,
    imageData: ctx.getImageData(0, 0, w, h),
    frameW: w,
    frameH: h,
  };
}

/** EMA-smooth card detections so the box doesn't jump every frame. */
export function smoothCard(
  prev: DetectedCard | null,
  next: DetectedCard | null,
  alpha = 0.35
): DetectedCard | null {
  if (!next) return prev;
  if (!prev) return next;
  return {
    xPct: prev.xPct * (1 - alpha) + next.xPct * alpha,
    yPct: prev.yPct * (1 - alpha) + next.yPct * alpha,
    wPct: prev.wPct * (1 - alpha) + next.wPct * alpha,
    score: next.score,
  };
}

/** Multi-model card detection: OWL-ViT → edge scanner → OpenCV → heuristic (ROI-first). */
export async function detectCardRectAsync(
  imageData: ImageData,
  exclude?: { xPct: number; yPct: number; rPct: number } | null,
  opts?: {
    lite?: boolean;
    heuristicOnly?: boolean;
    useOwl?: boolean;
    relaxed?: boolean;
    scannerOnly?: boolean;
  }
): Promise<DetectedCard | null> {
  const {
    cropImageData,
    cardSearchRoi,
    excludeInRoi,
    mapRoiDetectionToFull,
  } = await import("@/lib/card-roi");
  const { detectCardScanner } = await import("@/lib/card-scanner");

  const fullW = imageData.width;
  const fullH = imageData.height;
  const roi = cardSearchRoi(fullW, fullH);
  const { imageData: cropped, roi: cropRoi } = cropImageData(imageData, roi);
  const exRoi = excludeInRoi(exclude, cropRoi, fullW, fullH);
  const relaxed = opts?.relaxed ?? false;

  const mapHit = (hit: DetectedCard | null) =>
    hit ? mapRoiDetectionToFull(hit, cropRoi, fullW, fullH) : null;

  // Fast path: edge scanner only (live preview ticks)
  if (opts?.scannerOnly) {
    const scanned = detectCardScanner(cropped, exRoi, { relaxed });
    if (scanned && scanned.score > (relaxed ? 4 : 8)) return mapHit(scanned);
    const heur = detectCardRectHeuristic(cropped, exRoi, { relaxed });
    return mapHit(heur);
  }

  // 1. OWL-ViT zero-shot (best for real bank cards on cluttered backgrounds)
  if (opts?.useOwl !== false) {
    try {
      const { detectCardOwl } = await import("@/lib/card-owl");
      const owl = await detectCardOwl(cropped);
      if (owl && owl.score > 4) return mapHit(owl);
    } catch {
      /* model load/runtime failure */
    }
  }

  // 2. Fast edge scanner (iOS-safe, every frame)
  const scanned = detectCardScanner(cropped, exRoi, { relaxed });
  if (scanned && scanned.score > (relaxed ? 6 : 10)) return mapHit(scanned);

  // 3. OpenCV contours (desktop / post-capture)
  if (!opts?.heuristicOnly) {
    try {
      const { detectCardOpenCV } = await import("@/lib/opencv-card");
      const hit = await detectCardOpenCV(cropped, exRoi, opts);
      if (hit && hit.score > 12) return mapHit(hit);
    } catch {
      /* OpenCV load/runtime failure */
    }
  }

  // 4. Heuristic fallback
  const heur = detectCardRectHeuristic(cropped, exRoi, { relaxed });
  return mapHit(heur);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
