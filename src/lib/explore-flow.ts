export const AVAILABLE_US_SIZES = [6, 8, 10, 12] as const;
export type AvailableUsSize = (typeof AVAILABLE_US_SIZES)[number];

/** Fit colour for one measured circumference (from "Cut off values" sheet). */
export type FitColor = "green" | "red" | "black";

export type CircClassification = {
  /** Size band the value belongs to */
  us: AvailableUsSize;
  color: FitColor;
  /** Sheet band label, e.g. "8--" (red), "8-" (green), "8+" (black) */
  band: string;
  /** True when the value is below the whole chart (< 6--), counted as red */
  belowChart: boolean;
};

/**
 * Cut-off bands per stocked size (mm), from `Sizing variables.xlsx`:
 *
 *   red   [redStart, greenStart)   →  "S--"  loose side
 *   green [greenStart, sizeCirc]   →  "S-"   ok
 *   black (sizeCirc, blackEnd)     →  "S+"   too tight
 *
 * green/red widths are 25% each of the 5.1 mm gap between stocked sizes
 * (except size 6 which uses the US 5.5 boundary from the sheet).
 *
 * All values are scaled by SIZE_ADJUST (+1%), so e.g. US 10 becomes
 * 62.1 × 1.01 = 62.721 mm.
 */
const SIZE_ADJUST = 1.01;

const CUT_OFFS: {
  us: AvailableUsSize;
  redStart: number;
  greenStart: number;
  sizeCirc: number;
  blackEnd: number;
}[] = [
  { us: 6, redStart: 50.6, greenStart: 51.25, sizeCirc: 51.9, blackEnd: 54.45 },
  { us: 8, redStart: 54.45, greenStart: 55.725, sizeCirc: 57.0, blackEnd: 59.55 },
  { us: 10, redStart: 59.55, greenStart: 60.825, sizeCirc: 62.1, blackEnd: 64.65 },
  { us: 12, redStart: 64.65, greenStart: 65.925, sizeCirc: 67.2, blackEnd: Infinity },
].map((c) => ({
  us: c.us as AvailableUsSize,
  redStart: c.redStart * SIZE_ADJUST,
  greenStart: c.greenStart * SIZE_ADJUST,
  sizeCirc: c.sizeCirc * SIZE_ADJUST,
  blackEnd: c.blackEnd * SIZE_ADJUST,
}));

/** Classify one circumference (mm) into a size band + colour. */
export function classifyCircumference(circMm: number): CircClassification {
  // Below the whole chart → treat like the loose side of size 6
  if (circMm < CUT_OFFS[0].redStart) {
    return { us: 6, color: "red", band: "<6--", belowChart: true };
  }
  for (const c of CUT_OFFS) {
    if (circMm >= c.redStart && circMm < c.greenStart) {
      return { us: c.us, color: "red", band: `${c.us}--`, belowChart: false };
    }
    if (circMm >= c.greenStart && circMm <= c.sizeCirc) {
      return { us: c.us, color: "green", band: `${c.us}-`, belowChart: false };
    }
    if (circMm > c.sizeCirc && circMm < c.blackEnd) {
      return { us: c.us, color: "black", band: `${c.us}+`, belowChart: false };
    }
  }
  // Unreachable (size 12 black extends to Infinity) — satisfy TS
  return { us: 12, color: "black", band: "12+", belowChart: false };
}

export type FitLabel =
  | "perfect"
  | "tight"
  | "loose"
  | "very_loose"
  | "very_tight";

export type SizeVerdict =
  | { status: "size"; us: AvailableUsSize; fit: FitLabel }
  | { status: "remeasure" }
  | { status: "unavailable" };

/**
 * Decision tree on the 3 colours (OK = green):
 *
 *   3 green            → size, perfect
 *   2 green + 1 black  → size, tight
 *   2 green + 1 red    → size, loose
 *   1 green + 2 red    → size, very loose
 *   1 green + 2 black  → size, very tight
 *   3 black            → choose another finger and remeasure
 *
 * Extensions for combos not in the tree:
 *   3 red              → size, very loose
 *   any other mix      → remeasure
 *   all below chart    → size unavailable
 */
export function decideSize(circs: [number, number, number]): {
  verdict: SizeVerdict;
  classifications: CircClassification[];
} {
  const classifications = circs.map(classifyCircumference);

  if (classifications.every((c) => c.belowChart)) {
    return { verdict: { status: "unavailable" }, classifications };
  }

  const greens = classifications.filter((c) => c.color === "green").length;
  const reds = classifications.filter((c) => c.color === "red").length;
  const blacks = classifications.filter((c) => c.color === "black").length;

  if (blacks === 3) {
    return { verdict: { status: "remeasure" }, classifications };
  }

  const us = pickSize(classifications);

  if (greens === 3) {
    return { verdict: { status: "size", us, fit: "perfect" }, classifications };
  }
  if (greens === 2 && blacks === 1) {
    return { verdict: { status: "size", us, fit: "tight" }, classifications };
  }
  if (greens === 2 && reds === 1) {
    return { verdict: { status: "size", us, fit: "loose" }, classifications };
  }
  if (greens === 1 && reds === 2) {
    return {
      verdict: { status: "size", us, fit: "very_loose" },
      classifications,
    };
  }
  if (greens === 1 && blacks === 2) {
    return {
      verdict: { status: "size", us, fit: "very_tight" },
      classifications,
    };
  }
  if (reds === 3) {
    return {
      verdict: { status: "size", us, fit: "very_loose" },
      classifications,
    };
  }

  // Conflicting mix (e.g. 1 green + 1 red + 1 black) — ask to remeasure
  return { verdict: { status: "remeasure" }, classifications };
}

/** Majority size across the three values; green votes weigh more. */
function pickSize(classifications: CircClassification[]): AvailableUsSize {
  const weights = new Map<AvailableUsSize, number>();
  for (const c of classifications) {
    const w = c.color === "green" ? 1.5 : 1;
    weights.set(c.us, (weights.get(c.us) ?? 0) + w);
  }
  let best: AvailableUsSize = classifications[0].us;
  let bestW = 0;
  for (const [us, w] of weights) {
    if (w > bestW) {
      best = us;
      bestW = w;
    }
  }
  return best;
}

export function averageCircumference(values: number[]): number {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export type MeasureKey = "ring" | "finger" | "camera";

export type CircumferenceOutlier = {
  key: MeasureKey;
  label: string;
  valueMm: number;
  /** How far that extreme sits from the average, as % of avg */
  skewPct: number;
  kind: "min" | "max";
};

const MEASURE_LABELS: Record<MeasureKey, string> = {
  ring: "Using a ring",
  finger: "Measure finger",
  camera: "Camera",
};

/**
 * Detect a skewed measurement among the 3 Circ values.
 *
 * avg closer to max (min is ≥2% of avg farther than max) → min is the problem
 * avg closer to min (max is ≥2% of avg farther than min) → max is the problem
 */
export function findCircumferenceOutlier(
  measures: {
    ring: number;
    finger: number;
    camera: number;
  },
  thresholdPct = 0.02
): CircumferenceOutlier | null {
  const entries: { key: MeasureKey; value: number }[] = [
    { key: "ring", value: measures.ring },
    { key: "finger", value: measures.finger },
    { key: "camera", value: measures.camera },
  ];
  if (entries.some((e) => !Number.isFinite(e.value) || e.value <= 0)) return null;

  const values = entries.map((e) => e.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max <= min) return null;

  const avg = averageCircumference(values);
  if (avg <= 0) return null;

  const dMin = avg - min;
  const dMax = max - avg;
  const threshold = avg * thresholdPct;

  // Avg pulled toward max → low outlier (min) is the problem
  if (dMin - dMax >= threshold && dMin > dMax) {
    const hit = entries.find((e) => e.value === min)!;
    return {
      key: hit.key,
      label: MEASURE_LABELS[hit.key],
      valueMm: min,
      skewPct: (dMin / avg) * 100,
      kind: "min",
    };
  }

  // Avg pulled toward min → high outlier (max) is the problem
  if (dMax - dMin >= threshold && dMax > dMin) {
    const hit = entries.find((e) => e.value === max)!;
    return {
      key: hit.key,
      label: MEASURE_LABELS[hit.key],
      valueMm: max,
      skewPct: (dMax / avg) * 100,
      kind: "max",
    };
  }

  return null;
}


export type ExploreMeasurements = {
  ringCircMm: number | null;
  fingerCircMm: number | null;
  cameraCircMm: number | null;
};

const EXPLORE_KEY = "airing.exploreMeasurements";

export function loadExploreMeasurements(): ExploreMeasurements {
  if (typeof window === "undefined") {
    return { ringCircMm: null, fingerCircMm: null, cameraCircMm: null };
  }
  try {
    const raw = sessionStorage.getItem(EXPLORE_KEY);
    if (!raw) return { ringCircMm: null, fingerCircMm: null, cameraCircMm: null };
    return JSON.parse(raw) as ExploreMeasurements;
  } catch {
    return { ringCircMm: null, fingerCircMm: null, cameraCircMm: null };
  }
}

export function saveExploreMeasurements(data: ExploreMeasurements): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(EXPLORE_KEY, JSON.stringify(data));
}

export function clearExploreMeasurements(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(EXPLORE_KEY);
}
