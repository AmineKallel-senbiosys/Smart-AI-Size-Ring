"use client";

import { motion } from "framer-motion";

const STEPS = ["Start", "Calibrate", "Measure", "Result"] as const;

type Props = {
  stepIndex: number;
  onStepClick?: (index: number) => void;
};

export function WizardProgress({ stepIndex, onStepClick }: Props) {
  return (
    <ol className="flex items-center gap-1.5">
      {STEPS.map((label, i) => {
        const active = i === stepIndex;
        const done = i < stepIndex;
        const clickable = done && !!onStepClick;

        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick(i)}
              className={`flex min-w-0 items-center gap-1.5 ${
                clickable ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <span
                className={`mono flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] leading-none ${
                  active
                    ? "bg-[var(--ink)] text-[var(--bg)]"
                    : done
                      ? "gold-fill text-[var(--ink)]"
                      : "bg-[var(--surface-2)] text-[var(--muted)]"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`mono-label truncate ${
                  active
                    ? "text-[var(--ink)]"
                    : done
                      ? "text-[var(--gold-deep)]"
                      : "text-[var(--muted)]"
                }`}
              >
                {label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span
                className="h-px min-w-2 flex-1 bg-[var(--border)]"
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function StepFade({
  children,
  stepKey,
}: {
  children: React.ReactNode;
  stepKey: string;
}) {
  return (
    <motion.div
      key={stepKey}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Stage({
  caption,
  children,
  align = "center",
  bleed = false,
  crosshair = false,
  minHeight = 200,
  className = "",
}: {
  caption?: string;
  children: React.ReactNode;
  align?: "center" | "left";
  bleed?: boolean;
  crosshair?: boolean;
  minHeight?: number;
  className?: string;
}) {
  return (
    <div
      className={`stage relative border border-[var(--stage-line)] ${
        bleed ? "-mx-6 border-x-0 sm:-mx-8" : "rounded-xl"
      } ${className}`}
    >
      {caption && (
        <p className="mono-label px-4 pt-3 text-center text-[#8c7c66]">
          {caption}
        </p>
      )}
      <div className="overflow-auto overscroll-x-contain">
        <div
          className={`relative flex w-fit min-w-full py-6 ${
            bleed ? "px-4" : "px-5"
          }`}
          style={{ minHeight }}
        >
          {crosshair && (
            <>
              <span
                className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[#8c7c66]/30"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-[#8c7c66]/30"
                aria-hidden
              />
            </>
          )}
          <div
            className={`relative ${align === "left" ? "my-auto mr-auto" : "m-auto"}`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StepHeading({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-[family-name:var(--font-display)] text-[22px] leading-snug text-[var(--ink)]">
        {title}
      </h2>
      {children && (
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
          {children}
        </p>
      )}
    </div>
  );
}

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: "ring" | "finger";
  onChange: (m: "ring" | "finger") => void;
}) {
  return (
    <div className="mx-auto flex w-fit items-center gap-1 rounded-full bg-[var(--surface-2)] p-1">
      {(["ring", "finger"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
            mode === m
              ? "bg-[var(--ink)] text-[var(--bg)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          {m === "ring" ? "Use a ring" : "Measure finger"}
        </button>
      ))}
    </div>
  );
}

export function StepNav({
  onBack,
  onNext,
  nextLabel,
  backLabel = "Back",
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  backLabel?: string;
}) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
      >
        ‹ {backLabel}
      </button>
      <button
        type="button"
        onClick={onNext}
        className="gold-fill flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-[filter] hover:brightness-[1.04]"
      >
        {nextLabel} ›
      </button>
    </div>
  );
}

export function StepperButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-base text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
    >
      {children}
    </button>
  );
}
