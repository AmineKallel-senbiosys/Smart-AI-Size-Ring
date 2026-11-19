"use client";

import { HandPicker, type WearTarget } from "@/components/onehand/HandPicker";
import { FINGER_LABEL, type Gender } from "@/lib/onehand/engine";

const GENDERS: { id: Gender; label: string }[] = [
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
];

/** One page: gender (tunes the measurement) and where the customer will wear their Velia (picks the hand to measure). */
export function GenderStep({
  gender,
  onGender,
  wear,
  onWear,
}: {
  gender: Gender | null;
  onGender: (gender: Gender) => void;
  wear: WearTarget | null;
  onWear: (target: WearTarget) => void;
}) {
  return (
    <div className="velia-page">
      <div className="velia-head">
        <h1 className="velia-h1">What was your sex assigned at birth?</h1>
        <p className="velia-desc">
          This helps provide accurate, meaningful results.
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
      <p className="hp-q">Where will you wear your Velia?</p>
      <p className="hp-sub">Tap a finger to try the ring on. We&apos;ll measure that hand.</p>
      <HandPicker value={wear} onChange={onWear} />
      <p className="hp-pick" aria-live="polite">
        {wear ? (
          <>
            <b>{wear.hand === "left" ? "Left" : "Right"} hand</b> · {FINGER_LABEL[wear.finger]}
          </>
        ) : (
          " "
        )}
      </p>
    </div>
  );
}
