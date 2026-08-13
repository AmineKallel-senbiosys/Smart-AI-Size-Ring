import { CARD_ASPECT } from "@/lib/card-roi";
import type { DetectedCard } from "@/lib/detect";

type Exclude = { xPct: number; yPct: number; rPct: number } | null;

/**
 * Fast document-style scanner: adaptive threshold + connected components.
 * Works on a cropped ROI without OpenCV (iOS-safe).
 */
export function detectCardScanner(
  imageData: ImageData,
  exclude?: Exclude,
  opts?: { relaxed?: boolean }
): DetectedCard | null {
  const { width, height, data } = imageData;
  const relaxed = opts?.relaxed ?? false;

  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
  }

  const block = Math.max(9, (Math.min(width, height) / 16) | 0) | 1;
  const threshold = relaxed ? 5 : 4;

  const darkOnLight = scanBinaryComponents(
    adaptiveBinary(gray, width, height, block, threshold),
    width,
    height,
    exclude,
    relaxed
  );
  const lightOnDark = scanBinaryComponents(
    adaptiveBinary(invertGray(gray), width, height, block, threshold),
    width,
    height,
    exclude,
    relaxed
  );

  if (!darkOnLight && !lightOnDark) return null;
  if (!darkOnLight) return lightOnDark;
  if (!lightOnDark) return darkOnLight;
  return darkOnLight.score >= lightOnDark.score ? darkOnLight : lightOnDark;
}

function invertGray(gray: Uint8Array): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = 255 - gray[i];
  return out;
}

function scanBinaryComponents(
  binary: Uint8Array,
  width: number,
  height: number,
  exclude: Exclude | undefined,
  relaxed: boolean
): DetectedCard | null {
  const candidates: DetectedCard[] = [];
  const labels = new Int32Array(width * height);
  let nextLabel = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!binary[i] || labels[i]) continue;
      const label = nextLabel++;
      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const stack = [i];
      labels[i] = label;
      while (stack.length) {
        const ci = stack.pop()!;
        area++;
        const cx = ci % width;
        const cy = (ci / width) | 0;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (binary[ni] && !labels[ni]) {
            labels[ni] = label;
            stack.push(ni);
          }
        }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (area < width * height * (relaxed ? 0.02 : 0.035)) continue;
      if (area > width * height * 0.78) continue;

      const aspect = bw / Math.max(1, bh);
      const aspectOk =
        aspect > CARD_ASPECT * (relaxed ? 0.6 : 0.7) &&
        aspect < CARD_ASPECT * (relaxed ? 1.5 : 1.4);
      if (!aspectOk) continue;

      const cxPct = ((minX + maxX) / 2 / width) * 100;
      const cyPct = ((minY + maxY) / 2 / height) * 100;
      const wPct = (bw / width) * 100;

      if (exclude) {
        const dx = cxPct - exclude.xPct;
        const dy = cyPct - exclude.yPct;
        if (Math.hypot(dx, dy) < exclude.rPct) continue;
      }

      const fill = area / Math.max(1, bw * bh);
      const rectScore =
        fill * 55 + (1 - Math.abs(aspect - CARD_ASPECT) / CARD_ASPECT) * 45;

      candidates.push({
        xPct: cxPct,
        yPct: cyPct,
        wPct,
        score: rectScore,
      });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best.score < (relaxed ? 5 : 9)) return null;
  return best;
}

function adaptiveBinary(
  gray: Uint8Array,
  width: number,
  height: number,
  block: number,
  c: number
): Uint8Array {
  const out = new Uint8Array(width * height);
  const half = (block / 2) | 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          sum += gray[ny * width + nx];
          count++;
        }
      }
      const mean = sum / Math.max(1, count);
      const i = y * width + x;
      out[i] = gray[i] < mean - c ? 1 : 0;
    }
  }
  return out;
}
