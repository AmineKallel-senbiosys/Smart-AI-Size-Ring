"use client";

import { HandPhoto } from "@/components/onehand/HandPhoto";
import { sizeRows, type FingerKey, type HandSide, type OneHandSession } from "@/lib/onehand/engine";

/** Desktop "Recommended size" step: hand picture on the left, one row per finger on the right. */
export function OneHandSizes({
  session,
  selected,
  onSelect,
  wish,
  onOtherHand,
}: {
  session: OneHandSession;
  selected: FingerKey;
  onSelect: (finger: FingerKey) => void;
  /** the hand and finger the customer originally wanted to wear their Velia on */
  wish?: { hand: HandSide; finger: FingerKey } | null;
  /** set when the other hand has not been measured yet */
  onOtherHand?: () => void;
}) {
  const view = sizeRows(session);
  if (!view) return null;
  const wishRow = wish ? view.rows.find((row) => row.finger === wish.finger) : undefined;
  const wishFits = wishRow?.size != null;
  const best = view.rows.find((row) => row.bestFit && row.finger !== wish?.finger) ?? view.rows.find((row) => row.size != null && row.finger !== "thumb" && row.finger !== wish?.finger);
  const otherHand: HandSide = view.hand === "left" ? "right" : "left";
  const wishName = wishRow ? wishRow.label.toLowerCase() : "";
  const lowerLabel = (f: FingerKey) => view.rows.find((r) => r.finger === f)?.label.toLowerCase() ?? f;

  return (
    <div className="oh-sizes">
      <div className="oh-hand">
        <HandPhoto hand={view.hand} finger={selected} />
      </div>
      <div className="oh-list">
        <h1 className="velia-h1">Recommended size</h1>
        {wishRow && !wishFits && (
          <div className="oh-advice" role="status">
            <h2>
              Your {view.hand} {wishName} is outside our sizes
            </h2>
            <p>{wishRow.note} Your Velia can sit beautifully on another finger.</p>
            <div className="oh-advice-actions">
              {best && (
                <button type="button" className="primary" onClick={() => onSelect(best.finger)}>
                  Wear it on your {lowerLabel(best.finger)} · US {best.display}
                </button>
              )}
              {onOtherHand && (
                <button type="button" onClick={onOtherHand}>
                  Check my {otherHand} hand
                </button>
              )}
            </div>
          </div>
        )}
        {wishRow && wishFits && wish && wish.hand !== view.hand && (
          <div className="oh-advice good" role="status">
            <h2>
              Good news: your {view.hand} {wishName} fits
            </h2>
            <p>Your Velia will fit comfortably in US {wishRow.display}.</p>
          </div>
        )}
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
