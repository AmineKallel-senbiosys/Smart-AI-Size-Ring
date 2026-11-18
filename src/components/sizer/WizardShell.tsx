"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

const STEPS = ["Start", "Calibrate", "Measure", "Result"] as const;

type Props = {
  stepIndex: number;
  onStepClick?: (index: number) => void;
};

export function WizardProgress({ stepIndex, onStepClick }: Props) {
  return <ProgressSteps labels={STEPS} stepIndex={stepIndex} onStepClick={onStepClick} />;
}

export function ProgressSteps({ labels, stepIndex, onStepClick }: { labels: readonly string[]; stepIndex: number; onStepClick?: (index: number) => void }) {
  return <ol className="step-progress" aria-label="Sizing progress">
    {labels.map((label, i) => {
      const content = <><span aria-hidden>{i < stepIndex ? "✓" : i + 1}</span><span>{label}</span></>;
      return <li key={label} aria-current={i === stepIndex ? "step" : undefined}>
        {onStepClick && i < stepIndex ? <button type="button" className="step-progress-item" data-done="true" onClick={() => onStepClick(i)} aria-label={"Return to " + label}>{content}</button> : <span className="step-progress-item" data-active={i === stepIndex} data-done={i < stepIndex}>{content}</span>}
      </li>;
    })}
  </ol>;
}

export function StepFade({
  children,
  stepKey,
}: {
  children: React.ReactNode;
  stepKey: string;
}) {
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const heading = container.querySelector<HTMLElement>("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    const card = container.closest(".wizard-card");
    if (card && card.getBoundingClientRect().top < 110) {
      card.scrollIntoView({ block: "start", behavior: reducedMotion ? "instant" : "smooth" });
    }
  }, [stepKey, reducedMotion]);
  return (
    <motion.div
      ref={containerRef}
      key={stepKey}
      initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
      transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
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
        <p className="mono-label px-4 pt-3 text-center text-white/55">
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
                className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/25"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/25"
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
      <h2 className="step-heading">
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
    <div className="step-actions">
      <button
        type="button"
        onClick={onBack}
        className="btn-secondary"
      >
        ‹ {backLabel}
      </button>
      <button
        type="button"
        onClick={onNext}
        className="btn-primary"
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
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xl text-[var(--ink)] transition-colors hover:bg-[#ebebeb]"
    >
      {children}
    </button>
  );
}
