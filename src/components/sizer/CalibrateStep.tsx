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
      <StepHeading title="Calibrate your screen">
        Match a real card or coin to the dashed outline so millimetres are accurate.
      </StepHeading>

      {initial && saved && (
        <p className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--ink)]">
          ✓ Calibration saved on this device.
        </p>
      )}

      <div className="space-y-2">
        <label className="mono-label text-[var(--muted)]" htmlFor="ref-object">
          Reference object
        </label>
        <select
          id="ref-object"
          value={objectId}
          onChange={(e) => {
            setObjectId(e.target.value as CalibrationObjectId);
            setSaved(false);
          }}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
        >
          {CALIBRATION_OBJECTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <Stage
        caption={`Hold the ${obj.shape === "rect" ? "card" : "coin"} against the screen`}
        align="left"
        bleed
        minHeight={Math.max(168, outlinePx + 40)}
      >
        <div className="relative pl-3">
          {obj.shape === "rect" ? (
            <div
              className="shrink-0 rounded-md border-2 border-dashed border-[var(--accent-glow)]"
              style={{ width: cardWidthPx, height: outlinePx }}
            />
          ) : (
            <div
              className="shrink-0 rounded-full border-2 border-dashed border-[var(--accent-glow)]"
              style={{ width: outlinePx, height: outlinePx }}
            />
          )}
        </div>
      </Stage>

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
          className="h-4 flex-1"
          aria-label="Calibration scale"
        />
        <StepperButton label="Increase scale" onClick={() => nudge(0.02)}>
          +
        </StepperButton>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div>
          <p className="mono-label text-[var(--muted)]">Scale</p>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold">
            {scale.toFixed(2)}
          </p>
        </div>
        <button
          type="button"
          onClick={persist}
          className="mono-label rounded-lg bg-[var(--ink)] px-3 py-2 text-white"
        >
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      <StepNav
        onBack={onBack}
        onNext={() => {
          persist();
          onContinue();
        }}
        nextLabel="Continue"
      />
    </div>
  );
}
