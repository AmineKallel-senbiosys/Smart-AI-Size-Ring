"use client";

import type { Gender, HandSide } from "@/lib/onehand/engine";

const GENDERS: { id: Gender; label: string }[] = [
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
];

/** Step before the QR code: the measurement settings are tuned per gender. */
export function GenderStep({
  gender,
  hand,
  onGender,
  onHand,
}: {
  gender: Gender | null;
  hand: HandSide;
  onGender: (gender: Gender) => void;
  onHand: (hand: HandSide) => void;
}) {
  return (
    <div className="velia-page">
      <div className="velia-head">
        <h1 className="velia-h1">Choose your gender</h1>
        <p className="velia-desc">
          Finger shapes differ, so we tune the measurement for you. This is only used to find your size.
        </p>
      </div>
      <div className="velia-opts oh-gender" role="radiogroup" aria-label="Gender">
        {GENDERS.map((item) => {
          const on = gender === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`velia-opt ${on ? "on" : ""}`}
              onClick={() => onGender(item.id)}
            >
              <span className={`velia-radio ${on ? "on" : ""}`} aria-hidden />
              <span style={{ flex: 1 }}>{item.label}</span>
            </button>
          );
        })}
      </div>
      <p className="oh-label">Hand to measure</p>
      <div className="seg" role="group" aria-label="Hand to measure">
        {(["left", "right"] as const).map((side) => (
          <button key={side} type="button" className={hand === side ? "on" : undefined} onClick={() => onHand(side)}>
            {side === "left" ? "Left hand" : "Right hand"}
          </button>
        ))}
      </div>
    </div>
  );
}
