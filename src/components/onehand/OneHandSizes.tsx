"use client";

import { HandPhoto } from "@/components/onehand/HandPhoto";
import { sizeRows, type FingerKey, type OneHandSession } from "@/lib/onehand/engine";

/** Desktop "Recommended size" step: hand picture on the left, one row per finger on the right. */
export function OneHandSizes({
  session,
  selected,
  onSelect,
}: {
  session: OneHandSession;
  selected: FingerKey;
  onSelect: (finger: FingerKey) => void;
}) {
  const view = sizeRows(session);
  if (!view) return null;
  return (
    <div className="oh-sizes">
      <div className="oh-hand">
        <HandPhoto hand={view.hand} finger={selected} />
      </div>
      <div className="oh-list">
        <h1 className="velia-h1">Recommended size</h1>
        <p className="oh-pick-cap">Select the finger you&apos;ll wear your Velia on.</p>
        <div className="oh-rows" role="radiogroup" aria-label="Finger">
          {view.rows.map((row) => {
            const on = row.finger === selected;
            return (
              <button
                key={row.finger}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={row.size == null}
                className={`oh-row ${on ? "on" : ""}`}
                onClick={() => onSelect(row.finger)}
              >
                <span className="oh-size">{row.display}</span>
                {row.bestFit && <span className="oh-badge">Best fit</span>}
                <span className={`velia-radio ${on ? "on" : ""}`} aria-hidden />
                <span className="oh-finger">{row.label}</span>
                <span className={`oh-note ${row.outOfRange ? "warn" : ""}`}>{row.note}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
