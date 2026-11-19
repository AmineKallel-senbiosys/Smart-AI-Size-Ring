"use client";

import "./where.css";
import type { FingerKey, HandSide } from "@/lib/onehand/engine";
import { FINGER_LABEL } from "@/lib/onehand/engine";

export type WearTarget = { hand: HandSide; finger: FingerKey };

const HANDS: HandSide[] = ["left", "right"];
const W = 220;

/** Line-art left hand, back of the hand, thumb on the right. The right hand is mirrored. */
const HAND =
  "M62 268L40 214C38 208 36 200 36 190L36 120C36 104 41 96 47 96C53 96 58 104 58 120L59 150C60 160 66 160 66 150L66 80C66 64 71 56 77 56C83 56 88 64 88 80L89 136C90 146 96 146 97 136L97 50C97 34 102 28 108 28C114 28 119 34 119 50L120 134C121 144 127 144 128 134L129 72C129 58 134 52 139 52C145 52 150 58 150 72L151 168C152 180 156 184 160 176L172 148C176 140 182 138 187 142C192 147 190 154 186 160L168 206C164 216 160 232 158 268Z";

type Spot = { ring: [number, number, number, number]; hit: [number, number, number, number] };
/** ring: centre x, centre y, width, tilt (degrees) of the ring that appears on the finger */
const SPOTS: Record<FingerKey, Spot> = {
  little: { ring: [47, 134, 27, 0], hit: [32, 88, 30, 66] },
  ring: { ring: [77, 96, 27, 0], hit: [62, 48, 30, 100] },
  middle: { ring: [108, 70, 27, 0], hit: [93, 22, 30, 116] },
  index: { ring: [139.5, 92, 27, 0], hit: [125, 44, 30, 110] },
  thumb: { ring: [174.5, 178, 24, 18], hit: [162, 120, 40, 60] },
};
const ORDER: FingerKey[] = ["little", "ring", "middle", "index", "thumb"];

function HandArt({ hand, value, onPick }: { hand: HandSide; value: FingerKey | null; onPick: (f: FingerKey) => void }) {
  const mirror = hand === "right";
  const mx = (x: number) => (mirror ? W - x : x);
  const id = `hp-${hand}`;
  return (
    <svg viewBox={`0 16 ${W} 256`} role="group" aria-label={`${hand === "left" ? "Left" : "Right"} hand`}>
      <defs>
        {ORDER.map((f) => {
          const [x, y, w, h] = SPOTS[f].hit;
          return (
            <clipPath key={f} id={`${id}-${f}`}>
              <rect x={x} y={y} width={w} height={f === "thumb" ? h : 150 - y} />
            </clipPath>
          );
        })}
      </defs>
      <path d={HAND} className="hp-hand-bg" transform={mirror ? `translate(${W} 0) scale(-1 1)` : undefined} />
      {ORDER.map((f) => {
        const s = SPOTS[f];
        const on = value === f;
        const [x, y, w, h] = s.hit;
        return (
          <g
            key={f}
            role="radio"
            aria-checked={on}
            aria-label={`${hand === "left" ? "Left" : "Right"} hand, ${FINGER_LABEL[f]}`}
            tabIndex={0}
            className={`hp-f ${on ? "on" : ""}`}
            onClick={() => onPick(f)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick(f);
              }
            }}
          >
            <path d={HAND} className="hp-glow" clipPath={`url(#${id}-${f})`} transform={mirror ? `translate(${W} 0) scale(-1 1)` : undefined} />
            <rect x={mirror ? W - x - w : x} y={y} width={w} height={h} fill="transparent" />
          </g>
        );
      })}
      <path d={HAND} className="hp-outline" transform={mirror ? `translate(${W} 0) scale(-1 1)` : undefined} />
      {ORDER.map((f) => {
        const [cx, cy, rw, tilt] = SPOTS[f].ring;
        const on = value === f;
        const x = mx(cx);
        const rot = mirror ? -tilt : tilt;
        return (
          <g key={f} className={`hp-ringwrap ${on ? "on" : ""}`} transform={`rotate(${rot} ${x} ${cy})`}>
            {on ? (
              <g className="hp-drop">
                <rect x={x - rw / 2 - 2} y={cy - 6} width={rw + 4} height="12" rx="6" className="hp-halo" />
                <rect x={x - rw / 2} y={cy - 5} width={rw} height="10" rx="5" className="hp-band" />
                <rect x={x - rw / 2 + 4} y={cy - 2.8} width={rw - 8} height="1.6" rx=".8" className="hp-shine" />
              </g>
            ) : (
              <rect x={x - rw / 2} y={cy - 4.5} width={rw} height="9" rx="4.5" className="hp-ghost" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Two hands side by side. Tapping a finger chooses both the hand to measure and the finger to wear the Velia on. */
export function HandPicker({ value, onChange }: { value: WearTarget | null; onChange: (target: WearTarget) => void }) {
  return (
    <div className="hp" role="radiogroup" aria-label="Finger to wear your Velia on">
      {HANDS.map((hand) => (
        <div key={hand} className={`hp-hand ${value?.hand === hand ? "active" : ""}`}>
          <HandArt hand={hand} value={value?.hand === hand ? value.finger : null} onPick={(finger) => onChange({ hand, finger })} />
          <p className="hp-cap">{hand === "left" ? "Left hand" : "Right hand"}</p>
        </div>
      ))}
    </div>
  );
}
