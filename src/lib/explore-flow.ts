export const AVAILABLE_US_SIZES = [6, 8, 10, 12] as const;
/** Whole US sizes a competitor brand may report. */
export const COMPETITOR_US_SIZES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
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

export type MeasureKey = "ring" | "finger" | "jeweler" | "competitor";

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

export type MeasurementAction = "recommend" | "remeasure" | "another-finger";

/** Order-independent votes for 2–4 readings on the same finger and US size. */
export function measurementAction(ok: number, loose: number, anotherFinger: number): MeasurementAction {
  const n = ok + loose + anotherFinger;
  if (n < 2 || n > 4) return "remeasure";
  if (ok > n / 2) return "recommend";
  // Opposing loose and tight readings need verification before changing fingers.
  if (loose > 0 && anotherFinger > 0) return "remeasure";
  if (anotherFinger > n / 2) return "another-finger";
  if (loose > n / 2) return "another-finger";
  return "remeasure";
}

/** A strict majority decides; ties and different US sizes require remeasurement. */
export function decideSize(inputs: LabeledCirc[]): {
  verdict: SizeVerdict;
  classifications: MeasureClassification[];
} {
  const valid = inputs.every((i) => Number.isFinite(i.circMm) && i.circMm > 0);
  const classifications = inputs.filter((i) => Number.isFinite(i.circMm) && i.circMm > 0).map((i) => ({
    ...i,
    ...classifyCircumference(i.circMm),
  }));
  if (!valid || inputs.length < 2 || inputs.length > 4 || new Set(inputs.map((i) => i.key)).size !== inputs.length) {
    return { verdict: { status: "remeasure" }, classifications };
  }
  if (classifications.every((c) => c.belowChart)) {
    return { verdict: { status: "unavailable" }, classifications };
  }
  if (classifications.some((c) => c.belowChart) || new Set(classifications.map((c) => c.us)).size !== 1) {
    return { verdict: { status: "remeasure" }, classifications };
  }
  const ok = classifications.filter((c) => c.color === "green").length;
  const loose = classifications.filter((c) => c.color === "red").length;
  const another = classifications.filter((c) => c.color === "black").length;
  const action = measurementAction(ok, loose, another);
  const us = classifications[0].us;
  if (action === "recommend") return { verdict: { status: "size", us, fit: "perfect" }, classifications };
  if (action === "another-finger") return { verdict: { status: "size", us, fit: loose > another ? "very_loose" : "very_tight" }, classifications };
  return { verdict: { status: "remeasure" }, classifications };
}

/** Agreement describes the readings; it is not a guarantee of physical fit. */
export function consensusSize(inputs: LabeledCirc[]): {
  verdict: SizeVerdict;
  classifications: MeasureClassification[];
  sure: boolean;
} {
  const decided = decideSize(inputs);
  return {
    ...decided,
    sure: decided.verdict.status === "size" && decided.verdict.fit === "perfect" &&
      decided.classifications.every((c) => c.color === "green"),
  };
}

/**
 * Map a competitor's US size onto a stocked size.
 * 5 and 6 → 6, 7 and 8 → 8, 9 and 10 → 10, 11 and 12 → 12.
 * Above 12 does not map: that finger needs a smaller size.
 */
export function stockedFromCompetitorUs(us: number): AvailableUsSize | "smaller-finger" | null {
  if (!COMPETITOR_US_SIZES.some((size) => size === us)) return null;
  if (us > 12) return "smaller-finger";
  return AVAILABLE_US_SIZES.find((size) => size >= us) ?? "smaller-finger";
}

/** Tested fit band for one stocked size, in millimetres of circumference. */
export function fitBandFor(us: AvailableUsSize): {
  /** Below this, the size is outside the loose zone and can slip off. */
  secureMinMm: number;
  /** Start of the expected-fit zone. */
  comfortableFromMm: number;
  /** Stocked reference circumference. */
  referenceMm: number;
} {
  const row = CUT_OFFS.find((c) => c.us === us)!;
  return {
    secureMinMm: row.redStart,
    comfortableFromMm: row.greenStart,
    referenceMm: row.sizeCirc,
  };
}

export function formatLimitMm(mm: number): string {
  return Number(mm.toFixed(3)).toString();
}

export type FitGuidance = {
  /** One sentence under the recommended size. */
  sentence: string;
  /** Shown when the customer confirms an expected fit. */
  note: string;
  /** Only an expected fit can be confirmed. Looser or tighter moves to the next finger. */
  canConfirm: boolean;
};

/**
 * Customer copy for a size verdict.
 * `lowestMm` is the smallest measured circumference, used so a loose result
 * states the slip-off floor from the tested band.
 */
export function fitGuidance(
  fit: FitLabel,
  us: AvailableUsSize,
  lowestMm?: number
): FitGuidance {
  const floor = formatLimitMm(fitBandFor(us).secureMinMm);
  const belowFloor =
    lowestMm != null && Number.isFinite(lowestMm) && lowestMm < fitBandFor(us).secureMinMm;
  const fitNote =
    "A gentle fit is okay. Your ring should stay secure and feel comfortable.";
  const floorNote = `A gentle fit is okay down to ${floor} mm. Below that, this size can slip off.`;

  switch (fit) {
    case "perfect":
      return {
        sentence: "This is the expected fit.",
        note: fitNote,
        canConfirm: true,
      };
    case "loose":
      return {
        sentence: floorNote,
        note: `Measure the next selected finger. Under ${floor} mm, this size can slip off.`,
        canConfirm: false,
      };
    case "tight":
      return {
        sentence: "This ring will feel tight. Measure another finger.",
        note: "This ring will feel tight. Measure another finger.",
        canConfirm: false,
      };
    case "very_loose":
      return {
        sentence: belowFloor
          ? `This measurement is below ${floor} mm, so US ${us} can slip off. We won't confirm it.`
          : `These measures lean too loose to confirm. This size stays secure only down to ${floor} mm.`,
        note: floorNote,
        canConfirm: false,
      };
    case "very_tight":
      return {
        sentence: "This ring will feel tight. Measure another finger.",
        note: "This ring will feel tight. Measure another finger.",
        canConfirm: false,
      };
  }
}

/** Per-measure fit from its colour zone (not the combined decision tree). */
export function fitFromColor(color: FitColor): "ok" | "loose" | "tight" {
  if (color === "green") return "ok";
  if (color === "red") return "loose";
  return "tight";
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
  ring: "Ring on screen",
  finger: "Paper strip",
  jeweler: "Jeweler size",
  competitor: "Competitor size",
};

/**
 * Detect a skewed measurement among the 3 Circ values.
 *
 * avg closer to max (min is ≥2% of avg farther than max) → min is the problem
 * avg closer to min (max is ≥2% of avg farther than min) → max is the problem
 */
export function findCircumferenceOutlier(
  measures: Partial<Record<MeasureKey, number | null>>,
  thresholdPct = 0.02
): CircumferenceOutlier | null {
  const entries: { key: MeasureKey; value: number }[] = (
    Object.keys(MEASURE_LABELS) as MeasureKey[]
  )
    .map((key) => ({ key, value: Number(measures[key]) }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0);
  if (entries.length < 2) return null;

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


export type WearHand = "left" | "right";

export type WearFinger = "thumb" | "index" | "middle" | "ring" | "pinky";

export type FingerPick = { hand: WearHand; finger: WearFinger };

const WEAR_FINGERS: readonly WearFinger[] = ["thumb", "index", "middle", "ring", "pinky"];

export type ExploreMeasurements = {
  ringCircMm: number | null;
  fingerCircMm: number | null;
  jewelerCircMm: number | null;
  competitorCircMm: number | null;
  /** Primary, second, and third finger. Each pick names a hand and a finger. */
  wearPicks?: FingerPick[] | null;
  /** Index of the selected finger currently being measured (0, 1, or 2). */
  activeFingerIndex?: number;
  /** US size the competitor gave, from 5 to 14. */
  competitorUs?: number | null;
  /** True when the competitor size is above US 12. */
  competitorTooLarge?: boolean;
  /** True when the user skipped that step. */
  ringSkipped?: boolean;
  fingerSkipped?: boolean;
  jewelerSkipped?: boolean;
  competitorSkipped?: boolean;
};

const EMPTY_MEASUREMENTS: ExploreMeasurements = {
  ringCircMm: null,
  fingerCircMm: null,
  jewelerCircMm: null,
  competitorCircMm: null,
  wearPicks: null,
  activeFingerIndex: 0,
  competitorUs: null,
  competitorTooLarge: false,
  ringSkipped: false,
  fingerSkipped: false,
  jewelerSkipped: false,
  competitorSkipped: false,
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

/** Require three different hand-and-finger choices. The same finger on the other hand counts as its own choice. */
export function validFingerPlan(picks: readonly FingerPick[] | null | undefined): boolean {
  if (!picks || picks.length !== 3) return false;
  const keys = picks.map((pick) => `${pick.hand}:${pick.finger}`);
  return new Set(keys).size === 3 && picks.every((pick) =>
    (pick.hand === "left" || pick.hand === "right") && WEAR_FINGERS.includes(pick.finger),
  );
}

export function activeFingerIndex(measures: ExploreMeasurements): number {
  const index = measures.activeFingerIndex ?? 0;
  return Number.isInteger(index) && index >= 0 && index <= 2 ? index : 0;
}
