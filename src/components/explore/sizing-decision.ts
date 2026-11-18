import {
  classifyCircumference,
  measurementAction,
  type AvailableUsSize,
  type FitColor,
} from "@/lib/explore-flow";

export type MethodId = "known" | "kit" | "ring" | "strip";

export type FlowReading = {
  id: MethodId;
  circMm: number | null;
  us: AvailableUsSize | null;
  color: FitColor;
  tooLarge?: boolean;
  enteredUs?: number;
  belowChart?: boolean;
};

export type FlowDecision =
  | { d: "more" }
  | { d: "recommend"; us: AvailableUsSize; okCount: number }
  | { d: "next"; why: "loose" | "another" }
  | { d: "remeasure"; why: "sizes" | "mixed" };

/** Apply the same 2–4 measurement rules as the complete decision table. */
export function decideReadings(list: FlowReading[]): FlowDecision {
  const n = list.length;
  if (n < 2) return { d: "more" };
  if (n > 4 || new Set(list.map((reading) => reading.id)).size !== n ||
    list.some((reading) => reading.circMm != null && (!Number.isFinite(reading.circMm) || reading.circMm <= 0))) {
    return { d: "remeasure", why: "mixed" };
  }
  if (list.some((reading) => reading.tooLarge)) return { d: "next", why: "another" };
  if (list.every((reading) => reading.belowChart)) return { d: "next", why: "loose" };
  if (list.some((reading) => reading.belowChart) || list.some((reading) => reading.us == null) ||
    new Set(list.map((reading) => reading.us)).size !== 1) return { d: "remeasure", why: "sizes" };
  const ok = list.filter((reading) => reading.color === "green" && reading.us != null);
  const loose = list.filter((reading) => reading.color === "red").length;
  const another = list.filter((reading) => reading.color === "black").length;
  const action = measurementAction(ok.length, loose, another);
  if (action === "recommend") return { d: "recommend", us: ok[0].us as AvailableUsSize, okCount: ok.length };
  if (action === "another-finger") return { d: "next", why: loose ? "loose" : "another" };
  return { d: "remeasure", why: "mixed" };
}

export function readingFromCirc(id: MethodId, circMm: number): FlowReading {
  const zone = classifyCircumference(circMm);
  return { id, circMm, us: zone.us, color: zone.color, belowChart: zone.belowChart };
}
