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
 */
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
];

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

export type MeasureKey = "ring" | "finger" | "camera";

export type SizeVerdict =
  | { status: "size"; us: AvailableUsSize; fit: FitLabel }
  | { status: "remeasure" }
  | { status: "unavailable" };

export type LabeledCirc = {
  key: MeasureKey;
  circMm: number;
};

export type MeasureClassification = CircClassification & {
  key: MeasureKey;
  circMm: number;
};

/**
 * Decision tree on the colours (OK = green). Works with 2 or 3 measures
 * (ring can be skipped):
 *
 *   all green                 → size, perfect
 *   all-but-1 green + 1 black → size, tight
 *   all-but-1 green + 1 red   → size, loose
 *   1 green + 2+ red          → size, very loose
 *   1 green + 2+ black        → size, very tight
 *   all black                 → choose another finger and remeasure
 *
 * Extensions:
 *   all red            → size, very loose
 *   any other mix      → remeasure
 *   all below chart    → size unavailable
 */
export function decideSize(inputs: LabeledCirc[]): {
  verdict: SizeVerdict;
  classifications: MeasureClassification[];
} {
  const classifications: MeasureClassification[] = inputs.map((i) => ({
    key: i.key,
    circMm: i.circMm,
    ...classifyCircumference(i.circMm),
  }));

  const n = classifications.length;
  if (n === 0) {
    return { verdict: { status: "unavailable" }, classifications };
  }
  if (classifications.every((c) => c.belowChart)) {
    return { verdict: { status: "unavailable" }, classifications };
  }

  const greens = classifications.filter((c) => c.color === "green").length;
  const reds = classifications.filter((c) => c.color === "red").length;
  const blacks = classifications.filter((c) => c.color === "black").length;
  const us = pickSize(classifications);

  if (blacks === n) {
    return { verdict: { status: "remeasure" }, classifications };
  }
  if (greens === n) {
    return { verdict: { status: "size", us, fit: "perfect" }, classifications };
  }
  if (greens === n - 1 && blacks === 1) {
    return { verdict: { status: "size", us, fit: "tight" }, classifications };
  }
  if (greens === n - 1 && reds === 1) {
    return { verdict: { status: "size", us, fit: "loose" }, classifications };
  }
  if (greens === 1 && reds >= 2) {
    return {
      verdict: { status: "size", us, fit: "very_loose" },
      classifications,
    };
  }
  if (greens === 1 && blacks >= 2) {
    return {
      verdict: { status: "size", us, fit: "very_tight" },
      classifications,
    };
  }
  if (reds === n) {
    return {
      verdict: { status: "size", us, fit: "very_loose" },
      classifications,
    };
  }

  return { verdict: { status: "remeasure" }, classifications };
}

/** Per-measure fit from its colour zone (not the combined decision tree). */
export function fitFromColor(color: FitColor): "ok" | "loose" | "tight" {
  if (color === "green") return "ok";
  if (color === "red") return "loose";
  return "tight";
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
    ring?: number | null;
    finger: number;
    camera: number;
  },
  thresholdPct = 0.02
): CircumferenceOutlier | null {
  const entries: { key: MeasureKey; value: number }[] = [
    { key: "finger", value: measures.finger },
    { key: "camera", value: measures.camera },
  ];
  if (Number.isFinite(measures.ring) && Number(measures.ring) > 0) {
    entries.unshift({ key: "ring", value: Number(measures.ring) });
  }
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
  /** True when the user skipped the ring step (no ring available) */
  ringSkipped?: boolean;
};

const EMPTY_MEASUREMENTS: ExploreMeasurements = {
  ringCircMm: null,
  fingerCircMm: null,
  cameraCircMm: null,
  ringSkipped: false,
};

const EXPLORE_KEY = "airing.exploreMeasurements";

export function loadExploreMeasurements(): ExploreMeasurements {
  if (typeof window === "undefined") {
    return { ...EMPTY_MEASUREMENTS };
  }
  try {
    const raw = sessionStorage.getItem(EXPLORE_KEY);
    if (!raw) return { ...EMPTY_MEASUREMENTS };
    return { ...EMPTY_MEASUREMENTS, ...(JSON.parse(raw) as ExploreMeasurements) };
  } catch {
    return { ...EMPTY_MEASUREMENTS };
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
