export type RingStyleId = "classic" | "gold" | "silver" | "black";

export type RingStyle = {
  id: RingStyleId;
  label: string;
  /** PNG under /public, or null for the CSS ring */
  src: string | null;
  /**
   * Inner-hole diameter as a fraction of the image width.
   * Measured from the Velia assets (inscribed circle at the sensor bumps).
   */
  holeRatio: number;
};

/** Shared geometry for all three Velia product shots (same camera / crop). */
const VELIA_HOLE_RATIO = 0.7146;

export const RING_STYLES: RingStyle[] = [
  {
    id: "classic",
    label: "Classic",
    src: null,
    holeRatio: 1,
  },
  {
    id: "gold",
    label: "Gold",
    src: "/Velia - Gold - V2.png",
    holeRatio: VELIA_HOLE_RATIO,
  },
  {
    id: "silver",
    label: "Silver",
    src: "/Velia - Silver - lighter.png",
    holeRatio: VELIA_HOLE_RATIO,
  },
  {
    id: "black",
    label: "Black",
    src: "/Velia - Black - V2.png",
    holeRatio: VELIA_HOLE_RATIO,
  },
];

export function getRingStyle(id: RingStyleId): RingStyle {
  return RING_STYLES.find((s) => s.id === id) ?? RING_STYLES[0];
}

const STYLE_KEY = "airing.ringStyle";

export function loadRingStyle(): RingStyleId {
  if (typeof window === "undefined") return "classic";
  try {
    const raw = localStorage.getItem(STYLE_KEY) as RingStyleId | null;
    if (raw && RING_STYLES.some((s) => s.id === raw)) return raw;
  } catch {
    /* ignore */
  }
  return "classic";
}

export function saveRingStyle(id: RingStyleId): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STYLE_KEY, id);
}
