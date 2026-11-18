"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CALIBRATION_OBJECTS,
  DEFAULT_CARD_HEIGHT_CSS_PX,
  DEFAULT_COIN_CSS_PX,
  getObject,
  mmPerPxFromOutline,
  saveCalibration,
  type CalibrationObjectId,
  type StoredCalibration,
} from "@/lib/calibration";
import { Stage, StepHeading, StepNav, StepperButton } from "./WizardShell";

type Props = {
  initial: StoredCalibration | null;
  onSaved: (cal: StoredCalibration) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function CalibrateStep({ initial, onSaved, onBack, onContinue }: Props) {
  const [objectId, setObjectId] = useState<CalibrationObjectId>(
    initial?.objectId ?? "credit-card"
  );
  const [scale, setScale] = useState(initial?.scale ?? 1);
  const [saved, setSaved] = useState(!!initial);

  const obj = getObject(objectId);
  const basePx =
    obj.shape === "rect" ? DEFAULT_CARD_HEIGHT_CSS_PX : DEFAULT_COIN_CSS_PX;
  const outlinePx = basePx * scale;

  const mmPerPx = useMemo(
    () =>
      mmPerPxFromOutline(
        outlinePx,
        obj.shape === "rect" ? (obj.heightMm ?? obj.sizeMm) : obj.sizeMm
      ),
    [obj, outlinePx]
  );

  const nudge = useCallback((delta: number) => {
    setScale((s) => Math.min(2.5, Math.max(0.4, +(s + delta).toFixed(3))));
    setSaved(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, select, textarea, [contenteditable=true]")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudge(-0.01);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudge(0.01);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudge]);

  const persist = () => {
    const cal: StoredCalibration = {
      mmPerPx,
      objectId,
      scale,
      savedAt: Date.now(),
    };
    saveCalibration(cal);
    onSaved(cal);
    setSaved(true);
  };

  const cardWidthPx =
    obj.shape === "rect" && obj.widthMm && obj.heightMm
      ? outlinePx * (obj.widthMm / obj.heightMm)
      : outlinePx;

  return (
    <div className="space-y-5">
      <StepHeading title={obj.shape === "rect" ? "Match your card" : "Match your coin"}>
        Place a card or coin on screen. Adjust until the edges match.
      </StepHeading>

      {initial && saved && (
        <p className="rounded-lg bg-[var(--gold-soft)] px-3 py-2 text-sm text-[var(--ink)]">
          ✓ Screen calibrated. Continue or adjust below.
        </p>
      )}

      <div className="space-y-2">
        <label className="mono-label text-[var(--muted)]" htmlFor="ref-object">
          Use a card or coin
        </label>
        <select
          id="ref-object"
          value={objectId}
          onChange={(e) => {
            setObjectId(e.target.value as CalibrationObjectId);
            setSaved(false);
          }}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--gold)]"
        >
          {CALIBRATION_OBJECTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <Stage
        caption="Match the outer edges"
        align="left"
        minHeight={Math.max(168, outlinePx + 40)}
      >
        <div className="relative pl-3">
          <span
            className="absolute left-0 top-0 h-full w-px bg-[var(--gold)]/45"
            aria-hidden
          />
          <span
            className="mono absolute -left-0.5 -top-4 text-[10px] text-white/55"
            aria-hidden
          >
            0
          </span>
          {obj.shape === "rect" ? (
            <div
              className="shrink-0 rounded-md border-2 border-dashed border-[var(--gold-light)]"
              style={{ width: cardWidthPx, height: outlinePx }}
              aria-label="Credit card outline"
            />
          ) : (
            <div
              className="shrink-0 rounded-full border-2 border-dashed border-[var(--gold-light)]"
              style={{ width: outlinePx, height: outlinePx }}
              aria-label="Coin outline"
            />
          )}
        </div>
      </Stage>

      <p className="mono text-center text-[11px] leading-relaxed text-[var(--muted)]">
        Align left. Scroll sideways if needed.
      </p>

      <div className="flex items-center gap-3">
        <StepperButton label="Decrease scale" onClick={() => nudge(-0.02)}>
          −
        </StepperButton>
        <input
          type="range"
          min={0.4}
          max={2.5}
          step={0.01}
          value={scale}
          onChange={(e) => {
            setScale(+e.target.value);
            setSaved(false);
          }}
          className="h-11 min-w-0 flex-1"
          aria-label="Calibration scale"
        />
        <StepperButton label="Increase scale" onClick={() => nudge(0.02)}>
          +
        </StepperButton>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--muted)]">− Smaller · Larger +</span>
          <button
            type="button"
            onClick={() => {
              setScale(1);
              setSaved(false);
            }}
            className="mono-label rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Reset
          </button>
      </div>

      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        <summary className="mono-label cursor-pointer text-[var(--ink)]">
          Need help?
        </summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
          <li>Use 100% browser zoom.</li>
          <li>Remove any card sleeve and look straight at the screen.</li>
          <li>Repeat this step when switching devices.</li>
        </ul>
      </details>

      <StepNav
        onBack={onBack}
        onNext={() => {
          persist();
          onContinue();
        }}
        nextLabel="Screen is ready"
      />
    </div>
  );
}
