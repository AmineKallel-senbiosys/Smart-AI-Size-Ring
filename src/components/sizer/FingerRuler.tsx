"use client";

import { useCallback, useEffect, useRef } from "react";
import type { StoredCalibration } from "@/lib/calibration";
import {
  circumferenceToDiameter,
  formatMm,
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
  circumferenceMm: number;
  onCircumferenceChange: (mm: number) => void;
  onBack: () => void;
  onRecalibrate: () => void;
  onSwitchRing: () => void;
  onResult: () => void;
  guided?: boolean;
  nextLabel?: string;
};

const MIN_MM = 40;
const RULER_MM = 90;

export function FingerRuler({
  calibration,
  circumferenceMm,
  onCircumferenceChange,
  onBack,
  onRecalibrate,
  onSwitchRing,
  onResult,
  guided = false,
  nextLabel = "See my size",
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  const rulerCssPx = RULER_MM / calibration.mmPerPx;
  const markerLeft = circumferenceMm / calibration.mmPerPx;

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - rect.left, 0), rulerCssPx);
      const mm = +(x * calibration.mmPerPx).toFixed(1);
      onCircumferenceChange(Math.min(RULER_MM, Math.max(MIN_MM, mm)));
    },
    [calibration.mmPerPx, rulerCssPx, onCircumferenceChange]
  );

  const nudge = useCallback(
    (delta: number) => {
      onCircumferenceChange(
        Math.min(RULER_MM, Math.max(MIN_MM, +(circumferenceMm + delta).toFixed(1)))
      );
    },
    [circumferenceMm, onCircumferenceChange]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, select, textarea, [contenteditable=true]")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudge(-0.2);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudge(0.2);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudge]);

  return (
    <div className="space-y-5">
      <StepHeading title="Measure your finger">
        Wrap a thin paper strip snugly around your finger.
      </StepHeading>
      <ol className="grid grid-cols-3 gap-2 text-center text-sm text-[var(--ink)]">
        {["Wrap", "Mark overlap", "Lay flat at 0"].map((label, i) => (
          <li key={label} className="rounded-xl bg-[var(--surface-2)] px-2 py-3">
            <span className="mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface)] text-xs text-[var(--gold-deep)]">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {!guided && (
        <ModeToggle
          mode="finger"
          onChange={(m) => m === "ring" && onSwitchRing()}
        />
      )}

      <Stage
        caption="Move the gold marker to your mark"
        align="left"
      >
        <div
          ref={trackRef}
          className="relative h-20 shrink-0 cursor-pointer select-none touch-none"
          style={{ width: rulerCssPx }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) setFromClientX(e.clientX);
          }}
          role="slider"
          aria-valuemin={MIN_MM}
          aria-valuemax={RULER_MM}
          aria-valuenow={circumferenceMm}
          aria-label="Finger circumference in millimetres"
          tabIndex={0}
        >
          <div className="absolute inset-x-0 top-10 h-px bg-white/35" />
          {Array.from({ length: RULER_MM + 1 }, (_, i) => {
            const isMajor = i % 10 === 0;
            const isMid = i % 5 === 0;
            return (
              <div
                key={i}
                className="absolute top-10 -translate-x-1/2 bg-white/35"
                style={{
                  left: i / calibration.mmPerPx,
                  width: 1,
                  height: isMajor ? 14 : isMid ? 9 : 5,
                }}
              >
                {isMajor && (
                  <span className="mono absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] tabular-nums text-white/55">
                    {i}
                  </span>
                )}
              </div>
            );
          })}
          <div
            className="absolute top-3 z-10 -translate-x-1/2"
            style={{ left: markerLeft }}
          >
            <div className="h-14 w-0.5 bg-[var(--gold-light)]" />
            <div className="gold-fill absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full ring-2 ring-[var(--stage)]" />
          </div>
        </div>
      </Stage>

      <div className="flex items-center gap-3">
        <StepperButton label="Smaller" onClick={() => nudge(-0.5)}>
          −
        </StepperButton>
        <input
          type="range"
          min={MIN_MM}
          max={RULER_MM}
          step={0.1}
          value={circumferenceMm}
          onChange={(e) => onCircumferenceChange(+e.target.value)}
          className="h-11 min-w-0 flex-1"
          aria-label="Finger circumference"
        />
        <StepperButton label="Larger" onClick={() => nudge(0.5)}>
          +
        </StepperButton>
      </div>

      <p className="mono text-center text-[11px] text-[var(--muted)]">
        Scroll the ruler sideways if needed.
      </p>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div>
          <p className="mono-label text-[var(--gold-deep)]">Circumference</p>
          <p className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--gold)]">
            {formatMm(circumferenceMm)}
            <span className="ml-1.5 text-base text-[var(--muted)]">mm</span>
          </p>
        </div>
        <p className="mono text-right text-[11px] leading-relaxed text-[var(--muted)]">
          Ø {formatMm(circumferenceToDiameter(circumferenceMm), 2)} mm
        </p>
      </div>

      <StepNav onBack={onBack} onNext={onResult} nextLabel={nextLabel} />
      <button type="button" onClick={onRecalibrate} className="block text-sm text-[var(--gold-deep)] underline underline-offset-4">
        Adjust screen calibration
      </button>
    </div>
  );
}
