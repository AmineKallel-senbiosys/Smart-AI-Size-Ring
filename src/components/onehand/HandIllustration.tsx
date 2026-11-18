/** Simple hand drawing (from the one-hand pages) with an optional ring and an optional card above the fingers. */
const HAND_PATH =
  "M19 81 15 27Q14 20 18 20Q21 20 22 27L26 46Q28 49 29 44L26 12Q25 6 29 6Q33 6 33 12L36 43Q38 46 40 41L40 7Q40 1 44 1Q48 1 48 7L47 43Q49 48 52 43L56 15Q57 9 61 10Q64 11 63 17L60 52Q60 63 65 58L72 44Q75 39 79 42Q82 45 77 53L66 71 59 82";

export function HandIllustration({
  mirror = false,
  card = false,
  ringFinger,
  className,
}: {
  mirror?: boolean;
  card?: boolean;
  /** which finger shows the ring marker */
  ringFinger?: "little" | "ring" | "middle" | "index" | "thumb";
  className?: string;
}) {
  const ring = ringFinger ? RING_AT[ringFinger] : null;
  return (
    <svg className={className} viewBox="0 0 100 125" role="img" aria-label="Hand illustration">
      {card && <rect x="30" y="1" width="43" height="27" rx="3" fill="#121212" />}
      <g transform={`translate(${mirror ? 94 : 5} ${card ? 37 : 30}) ${mirror ? "scale(-1 1)" : ""}`}>
        <path d={HAND_PATH} fill="#e7c3ae" stroke="#cf9f86" strokeWidth="1" strokeLinejoin="round" />
        {ring && <rect x={ring.x} y={ring.y} width="9" height="5" rx="2.5" fill="#6b6b6b" stroke="#2a2a2a" strokeWidth=".8" />}
      </g>
    </svg>
  );
}

const RING_AT = {
  little: { x: 13.5, y: 32 },
  ring: { x: 24.5, y: 20 },
  middle: { x: 39.5, y: 14 },
  index: { x: 56.5, y: 22 },
  thumb: { x: 68, y: 44 },
} as const;
