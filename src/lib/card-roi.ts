import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from "@/lib/calibration";
import type { DetectedCard } from "@/lib/detect";

/** Matches the on-screen CARD guide ghost (right side). */
export const CARD_GUIDE: DetectedCard = {
  xPct: 72,
  yPct: 58,
  wPct: 42,
  score: 0,
};

export type PixelRoi = { x0: number; y0: number; x1: number; y1: number };

/** Search region — right side of frame where the user places the card. */
export function cardSearchRoi(width: number, height: number): PixelRoi {
  return {
    x0: Math.floor(width * 0.46),
    y0: Math.floor(height * 0.28),
    x1: Math.ceil(width * 0.99),
    y1: Math.ceil(height * 0.94),
  };
}

export function cropImageData(
  imageData: ImageData,
  roi: PixelRoi
): { imageData: ImageData; roi: PixelRoi } {
  const w = Math.max(1, roi.x1 - roi.x0);
  const h = Math.max(1, roi.y1 - roi.y0);
  const out = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((roi.y0 + y) * imageData.width + (roi.x0 + x)) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = imageData.data[si];
      out.data[di + 1] = imageData.data[si + 1];
      out.data[di + 2] = imageData.data[si + 2];
      out.data[di + 3] = imageData.data[si + 3];
    }
  }
  return { imageData: out, roi };
}

/** Map detection from ROI-local % coords to full-frame % coords. */
export function mapRoiDetectionToFull(
  hit: DetectedCard,
  roi: PixelRoi,
  fullW: number,
  fullH: number
): DetectedCard {
  const rw = roi.x1 - roi.x0;
  const rh = roi.y1 - roi.y0;
  const cx = roi.x0 + (hit.xPct / 100) * rw;
  const cy = roi.y0 + (hit.yPct / 100) * rh;
  const wPx = (hit.wPct / 100) * rw;
  return {
    xPct: (cx / fullW) * 100,
    yPct: (cy / fullH) * 100,
    wPct: (wPx / fullW) * 100,
    score: hit.score,
  };
}

export function excludeInRoi(
  exclude: { xPct: number; yPct: number; rPct: number } | null | undefined,
  roi: PixelRoi,
  fullW: number,
  fullH: number
): { xPct: number; yPct: number; rPct: number } | null {
  if (!exclude) return null;
  const rw = roi.x1 - roi.x0;
  const rh = roi.y1 - roi.y0;
  const cx = (exclude.xPct / 100) * fullW;
  const cy = (exclude.yPct / 100) * fullH;
  if (cx < roi.x0 || cx > roi.x1 || cy < roi.y0 || cy > roi.y1) return null;
  return {
    xPct: ((cx - roi.x0) / rw) * 100,
    yPct: ((cy - roi.y0) / rh) * 100,
    rPct: (exclude.rPct / 100) * Math.min(fullW, fullH) * (100 / Math.min(rw, rh)),
  };
}

export const CARD_ASPECT = CARD_WIDTH_MM / CARD_HEIGHT_MM;
