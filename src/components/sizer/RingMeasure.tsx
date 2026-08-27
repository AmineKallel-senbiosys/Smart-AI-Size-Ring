"use client";

import { useCallback, useEffect, useState } from "react";
import type { StoredCalibration } from "@/lib/calibration";
import {
  diameterToCircumference,
  formatMm,
} from "@/lib/convert";
import {
  getRingStyle,
  loadRingStyle,
  RING_STYLES,
  saveRingStyle,
  type RingStyleId,
} from "@/lib/ring-styles";
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
  /** Guided explore: hide mode toggle, custom continue label */
  guided?: boolean;
  nextLabel?: string;
};

const MIN_MM = 12;
const MAX_MM = 24;

function ClassicRing({ holePx }: { holePx: number }) {
  const bandPx = Math.max(10, holePx * 0.13);
  const outerPx = holePx + bandPx * 2;
  return (
    <div
      className="ring-band relative shrink-0 rounded-full shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9),inset_0_1px_2px_rgba(255,255,255,0.35)]"
      style={{ width: outerPx, height: outerPx }}
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--stage)] shadow-[inset_0_1px_3px_rgba(0,0,0,0.85)]"
        style={{ width: holePx, height: holePx }}
      />
    </div>
  );
}

function StyleThumb({
  id,
  label,
  src,
  active,
  onSelect,
}: {
  id: RingStyleId;
  label: string;
  src: string | null;
  active: boolean;
  onSelect: (id: RingStyleId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={active}
      aria-label={`Use ${label} ring`}
      className={`flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition ${
        active
          ? "bg-[var(--ink)] text-[var(--bg)]"
          : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white ${
          active
            ? "ring-2 ring-[var(--gold)] ring-offset-1 ring-offset-[var(--ink)]"
            : ""
        }`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <span className="ring-band block h-7 w-7 rounded-full">
            <span className="mx-auto mt-[7px] block h-3.5 w-3.5 rounded-full bg-white" />
          </span>
        )}
      </span>
      <span className="mono-label px-1 pb-0.5">{label}</span>
    </button>
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
  guided = false,
  nextLabel = "Next step",
}: Props) {
  const [styleId, setStyleId] = useState<RingStyleId>("classic");
  const style = getRingStyle(styleId);

  useEffect(() => {
    setStyleId(loadRingStyle());
  }, []);

  const holePx = diameterMm / calibration.mmPerPx;
  const imagePx = style.src ? holePx / style.holeRatio : holePx;
  const renderPx = style.src
    ? imagePx
    : holePx + Math.max(10, holePx * 0.13) * 2;

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

  const selectStyle = (id: RingStyleId) => {
    setStyleId(id);
    saveRingStyle(id);
  };

  return (
    <div className="space-y-5">
      <StepHeading title="Place your ring on the screen">
        Drag the slider until the ring matches the inner edge of yours.{" "}
        <button
          type="button"
          onClick={onRecalibrate}
          className="text-[var(--gold-deep)] underline underline-offset-2 hover:text-[var(--ink)]"
        >
          Re-calibrate screen
        </button>
      </StepHeading>

      {!guided && (
        <ModeToggle
          mode="ring"
          onChange={(m) => m === "finger" && onSwitchFinger()}
        />
      )}

      <div>
        <p className="mono-label mb-2 text-center text-[var(--muted)]">
          Ring style
        </p>
        <div className="flex flex-wrap items-start justify-center gap-2">
          {RING_STYLES.map((s) => (
            <StyleThumb
              key={s.id}
              id={s.id}
              label={s.label}
              src={s.src}
              active={styleId === s.id}
              onSelect={selectStyle}
            />
          ))}
        </div>
      </div>

      <Stage
        caption="Place ring · match the inner edge"
        crosshair
        minHeight={Math.max(340, renderPx + 72)}
      >
        {style.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={style.src}
            alt={`${style.label} ring`}
            width={imagePx}
            height={imagePx}
            className="pointer-events-none shrink-0 select-none"
            style={{ width: imagePx, height: imagePx }}
            draggable={false}
          />
        ) : (
          <ClassicRing holePx={holePx} />
        )}
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

      <p className="mono text-center text-[11px] text-[var(--muted)]">
        Use ← → arrow keys for fine adjustment
      </p>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div>
          <p className="mono-label text-[var(--gold-deep)]">Circumference</p>
          <p className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--gold)]">
            {formatMm(diameterToCircumference(diameterMm))}
            <span className="ml-1.5 text-base text-[var(--muted)]">mm</span>
          </p>
        </div>
        <p className="mono text-right text-[11px] leading-relaxed text-[var(--muted)]">
          Ø {formatMm(diameterMm, 2)} mm
        </p>
      </div>

      <StepNav onBack={onBack} onNext={onResult} nextLabel={nextLabel} />
    </div>
  );
}
