"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { StoredCalibration } from "@/lib/calibration";
import {
  diameterToCircumference,
  findNearestByDiameter,
  formatMm,
  formatUsSize,
} from "@/lib/convert";
import {
  ModeToggle,
  Stage,
  StepHeading,
  StepNav,
  StepperButton,
} from "./WizardShell";

type Props = {
  calibration: StoredCalibration;
  diameterMm: number;
  onDiameterChange: (mm: number) => void;
  onBack: () => void;
  onRecalibrate: () => void;
  onSwitchFinger: () => void;
  onResult: () => void;
};

const MIN_MM = 12;
const MAX_MM = 24;

function ClassicRing({ holePx }: { holePx: number }) {
  const bandPx = Math.max(10, holePx * 0.13);
  const outerPx = holePx + bandPx * 2;
  return (
    <div
      className="ring-band relative shrink-0 rounded-full shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)]"
      style={{ width: outerPx, height: outerPx }}
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--stage)]"
        style={{ width: holePx, height: holePx }}
      />
    </div>
  );
}

export function RingMeasure({
  calibration,
  diameterMm,
  onDiameterChange,
  onBack,
  onRecalibrate,
  onSwitchFinger,
  onResult,
}: Props) {
  const holePx = diameterMm / calibration.mmPerPx;
  const renderPx = holePx + Math.max(10, holePx * 0.13) * 2;
  const preview = useMemo(() => findNearestByDiameter(diameterMm), [diameterMm]);

  const nudge = useCallback(
    (deltaMm: number) => {
      onDiameterChange(
        Math.min(MAX_MM, Math.max(MIN_MM, +(diameterMm + deltaMm).toFixed(2)))
      );
    },
    [diameterMm, onDiameterChange]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudge(-0.05);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudge(0.05);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudge]);

  return (
    <div className="space-y-5">
      <StepHeading title="Place your ring on the screen">
        Match the inner edge.{" "}
        <button
          type="button"
          onClick={onRecalibrate}
          className="text-[var(--accent-deep)] underline underline-offset-2"
        >
          Re-calibrate
        </button>
      </StepHeading>

      <ModeToggle
        mode="ring"
        onChange={(m) => m === "finger" && onSwitchFinger()}
      />

      <Stage
        caption="Place ring · match the inner edge"
        crosshair
        minHeight={Math.max(280, renderPx + 72)}
      >
        <ClassicRing holePx={holePx} />
      </Stage>

      <div className="flex items-center gap-3">
        <StepperButton label="Smaller" onClick={() => nudge(-0.1)}>
          −
        </StepperButton>
        <input
          type="range"
          min={MIN_MM}
          max={MAX_MM}
          step={0.05}
          value={diameterMm}
          onChange={(e) => onDiameterChange(+e.target.value)}
          className="h-4 flex-1"
          aria-label="Ring inner diameter"
        />
        <StepperButton label="Larger" onClick={() => nudge(0.1)}>
          +
        </StepperButton>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div>
          <p className="mono-label text-[var(--muted)]">US Size</p>
          <p className="font-[family-name:var(--font-display)] text-3xl font-bold">
            {formatUsSize(preview.row.us)}
          </p>
        </div>
        <p className="mono text-right text-[11px] text-[var(--muted)]">
          Ø {formatMm(diameterMm, 2)} mm
          <br />
          Circ {formatMm(diameterToCircumference(diameterMm))} mm
        </p>
      </div>

      <StepNav onBack={onBack} onNext={onResult} nextLabel="See my size" />
    </div>
  );
}
