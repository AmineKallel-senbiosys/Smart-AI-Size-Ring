import { RING_SIZES, type RingSizeRow } from "./ring-sizes";

export type ConvertedSize = {
  row: RingSizeRow;
  diameterMm: number;
  circumferenceMm: number;
  /** Absolute error in mm from measured circumference */
  errorMm: number;
};

export function diameterToCircumference(diameterMm: number): number {
  return diameterMm * Math.PI;
}

export function circumferenceToDiameter(circumferenceMm: number): number {
  return circumferenceMm / Math.PI;
}

export function findNearestByCircumference(
  circumferenceMm: number
): ConvertedSize {
  let best = RING_SIZES[0];
  let bestErr = Math.abs(best.circumferenceMm - circumferenceMm);

  for (const row of RING_SIZES) {
    const err = Math.abs(row.circumferenceMm - circumferenceMm);
    if (err < bestErr) {
      best = row;
      bestErr = err;
    }
  }

  return {
    row: best,
    diameterMm: circumferenceToDiameter(circumferenceMm),
    circumferenceMm,
    errorMm: bestErr,
  };
}

export function findNearestByDiameter(diameterMm: number): ConvertedSize {
  return findNearestByCircumference(diameterToCircumference(diameterMm));
}

export function formatUsSize(us: number): string {
  if (Number.isInteger(us)) return String(us);
  const whole = Math.floor(us);
  const frac = us - whole;
  if (Math.abs(frac - 0.25) < 0.01) return `${whole}¼`;
  if (Math.abs(frac - 0.5) < 0.01) return `${whole}½`;
  if (Math.abs(frac - 0.75) < 0.01) return `${whole}¾`;
  return us.toFixed(2);
}

export function formatMm(n: number, digits = 1): string {
  return n.toFixed(digits);
}
