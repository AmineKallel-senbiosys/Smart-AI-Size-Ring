import type { DetectedCard } from "@/lib/detect";
import { isMobileDevice } from "@/lib/mobile";

const CARD_ASPECT = 85.6 / 53.98;
const MIN_AREA_RATIO = 0.04;
const MAX_AREA_RATIO = 0.55;
const OPENCV_CDN =
  "https://docs.opencv.org/4.9.0/opencv.js";

type Point = { x: number; y: number };
type Cv = OpenCvRuntime;

type OpenCvRuntime = {
  Mat: new () => OpenCvMat;
  matFromImageData: (imageData: ImageData) => OpenCvMat;
  cvtColor: (src: OpenCvMat, dst: OpenCvMat, code: number) => void;
  COLOR_RGBA2GRAY: number;
  GaussianBlur: (
    src: OpenCvMat,
    dst: OpenCvMat,
    ksize: OpenCvSize,
    sigmaX: number
  ) => void;
  Size: new (w: number, h: number) => OpenCvSize;
  adaptiveThreshold: (
    src: OpenCvMat,
    dst: OpenCvMat,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    C: number
  ) => void;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY: number;
  THRESH_BINARY_INV: number;
  morphologyEx: (
    src: OpenCvMat,
    dst: OpenCvMat,
    op: number,
    kernel: OpenCvMat
  ) => void;
  MORPH_CLOSE: number;
  MORPH_RECT: number;
  getStructuringElement: (shape: number, ksize: OpenCvSize) => OpenCvMat;
  Canny: (
    src: OpenCvMat,
    dst: OpenCvMat,
    t1: number,
    t2: number
  ) => void;
  dilate: (
    src: OpenCvMat,
    dst: OpenCvMat,
    kernel: OpenCvMat
  ) => void;
  findContours: (
    image: OpenCvMat,
    contours: OpenCvMatVector,
    hierarchy: OpenCvMat,
    mode: number,
    method: number
  ) => void;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  contourArea: (contour: OpenCvMat) => number;
  arcLength: (curve: OpenCvMat, closed: boolean) => number;
  approxPolyDP: (
    curve: OpenCvMat,
    approx: OpenCvMat,
    epsilon: number,
    closed: boolean
  ) => void;
  isContourConvex: (contour: OpenCvMat) => boolean;
  MatVector: new () => OpenCvMatVector;
};

type OpenCvMat = {
  rows: number;
  delete: () => void;
  intAt: (row: number, col: number) => number;
};

type OpenCvMatVector = {
  size: () => number;
  get: (i: number) => OpenCvMat;
  delete: () => void;
};

type OpenCvSize = { width: number; height: number };

declare global {
  interface Window {
    cv?: Cv & { onRuntimeInitialized?: () => void; Mat?: unknown };
  }
}

let cvPromise: Promise<Cv> | null = null;

export function preloadOpenCv(): Promise<Cv> {
  if (!cvPromise) cvPromise = loadOpenCvScript();
  return cvPromise;
}

function loadOpenCvScript(): Promise<Cv> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV only runs in browser"));
  }

  if (window.cv?.Mat) {
    return Promise.resolve(window.cv);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-opencv-js]"
    );
    if (existing) {
      existing.addEventListener("load", () => waitCv(resolve, reject));
      existing.addEventListener("error", () =>
        reject(new Error("OpenCV script failed"))
      );
      waitCv(resolve, reject);
      return;
    }

    const script = document.createElement("script");
    script.src = OPENCV_CDN;
    script.async = true;
    script.dataset.opencvJs = "true";
    script.onload = () => waitCv(resolve, reject);
    script.onerror = () => reject(new Error("OpenCV script failed to load"));
    document.head.appendChild(script);
  });
}

function waitCv(resolve: (cv: Cv) => void, reject: (e: Error) => void) {
  const cv = window.cv;
  if (!cv) {
    reject(new Error("OpenCV not on window"));
    return;
  }
  if (cv.Mat) {
    resolve(cv);
    return;
  }
  cv.onRuntimeInitialized = () => resolve(cv);
}

type ExcludeZone = { xPct: number; yPct: number; rPct: number } | null;

export async function detectCardOpenCV(
  imageData: ImageData,
  exclude?: ExcludeZone,
  opts?: { lite?: boolean }
): Promise<DetectedCard | null> {
  const cv = await preloadOpenCv();
  const lite = opts?.lite ?? isMobileDevice();
  const { width, height } = imageData;
  const mats: OpenCvMat[] = [];

  const track = (m: OpenCvMat) => {
    mats.push(m);
    return m;
  };

  try {
    const src = track(cv.matFromImageData(imageData));
    const gray = track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const blurred = track(new cv.Mat());
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    let best: DetectedCard | null = null;

    const tryPass = (binary: OpenCvMat, weight: number) => {
      const hit = findBestQuad(
        cv,
        binary,
        width,
        height,
        exclude ?? null,
        weight,
        mats
      );
      if (hit && (!best || hit.score > best.score)) best = hit;
    };

    const adapt = track(new cv.Mat());
    cv.adaptiveThreshold(
      blurred,
      adapt,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      15,
      4
    );
    const morph = track(new cv.Mat());
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(adapt, morph, cv.MORPH_CLOSE, kernel);
    kernel.delete();
    tryPass(morph, 1.1);

    if (!lite) {
      const adaptInv = track(new cv.Mat());
      cv.adaptiveThreshold(
        blurred,
        adaptInv,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        15,
        4
      );
      tryPass(adaptInv, 1.05);

      const edges = track(new cv.Mat());
      cv.Canny(blurred, edges, 40, 120);
      const dilated = track(new cv.Mat());
      const k2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.dilate(edges, dilated, k2);
      k2.delete();
      tryPass(dilated, 1.0);
    }

    return best;
  } finally {
    for (const m of mats) m.delete();
  }
}

function findBestQuad(
  cv: Cv,
  binary: OpenCvMat,
  width: number,
  height: number,
  exclude: ExcludeZone,
  passWeight: number,
  mats: OpenCvMat[]
): DetectedCard | null {
  const contours = new cv.MatVector();
  const hierarchy = trackMat(new cv.Mat(), mats);
  cv.findContours(
    binary,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  const frameArea = width * height;
  let best: DetectedCard | null = null;

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < MIN_AREA_RATIO * frameArea || area > MAX_AREA_RATIO * frameArea) {
      continue;
    }

    const peri = cv.arcLength(cnt, true);
    const approx = trackMat(new cv.Mat(), mats);
    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

    if (approx.rows < 4 || approx.rows > 6) continue;
    if (!cv.isContourConvex(approx)) continue;

    const corners = extractCorners(approx);
    if (corners.length !== 4) continue;

    const aspect = quadAspect(corners);
    if (aspect < CARD_ASPECT * 0.72 || aspect > CARD_ASPECT * 1.38) continue;

    const box = quadBounds(corners);
    const cxPct = (box.cx / width) * 100;
    const cyPct = (box.cy / height) * 100;
    const wPct = (box.longEdge / width) * 100;

    if (wPct < 12 || wPct > 78) continue;

    if (exclude) {
      const dx = cxPct - exclude.xPct;
      const dy = cyPct - exclude.yPct;
      if (Math.hypot(dx, dy) < exclude.rPct) continue;
    }

    const rightBias = cxPct / 100;
    if (rightBias < 0.2) continue;

    const aspectErr = Math.abs(aspect - CARD_ASPECT) / CARD_ASPECT;
    const areaScore = area / frameArea;
    const score =
      passWeight * (areaScore * 120 + (1 - aspectErr) * 80 + rightBias * 25);

    if (!best || score > best.score) {
      best = { xPct: cxPct, yPct: cyPct, wPct, score };
    }
  }

  contours.delete();
  return best;
}

function trackMat(m: OpenCvMat, mats: OpenCvMat[]) {
  mats.push(m);
  return m;
}

function extractCorners(approx: OpenCvMat): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < approx.rows; i++) {
    pts.push({ x: approx.intAt(i, 0), y: approx.intAt(i, 1) });
  }
  return pts;
}

function quadAspect(corners: Point[]): number {
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const e0 = d(corners[0], corners[1]);
  const e1 = d(corners[1], corners[2]);
  const e2 = d(corners[2], corners[3]);
  const e3 = d(corners[3], corners[0]);
  const pairA = (e0 + e2) / 2;
  const pairB = (e1 + e3) / 2;
  const long = Math.max(pairA, pairB);
  const short = Math.min(pairA, pairB);
  if (short < 1) return 0;
  return long / short;
}

function quadBounds(corners: Point[]) {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    longEdge: Math.max(w, h),
  };
}
