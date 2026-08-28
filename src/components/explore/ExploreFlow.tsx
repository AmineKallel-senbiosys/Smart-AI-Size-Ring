"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { RingMark } from "@/components/RingMark";
import { CalibrateStep } from "@/components/sizer/CalibrateStep";
import { FingerRuler } from "@/components/sizer/FingerRuler";
import { RingMeasure } from "@/components/sizer/RingMeasure";
import { StepFade, StepHeading } from "@/components/sizer/WizardShell";
import { diameterToCircumference, formatMm } from "@/lib/convert";
import {
  loadCalibration,
  type StoredCalibration,
} from "@/lib/calibration";
import {
  clearExploreMeasurements,
  decideSize,
  findCircumferenceOutlier,
  fitFromColor,
  loadExploreMeasurements,
  saveExploreMeasurements,
  type CircumferenceOutlier,
  type ExploreMeasurements,
  type FitLabel,
  type MeasureClassification,
  type SizeVerdict,
} from "@/lib/explore-flow";

type Step =
  | "intro"
  | "calibrate"
  | "measure-ring"
  | "measure-finger"
  | "collect"
  | "result";

const stepIndex: Record<Step, number> = {
  intro: 0,
  calibrate: 1,
  "measure-ring": 2,
  "measure-finger": 2,
  collect: 3,
  result: 4,
};

const PROGRESS_LABELS = ["Start", "Calibrate", "Measure", "Combine", "Result"];

export function ExploreFlow() {
  const [step, setStep] = useState<Step>("intro");
  const [calibration, setCalibration] = useState<StoredCalibration | null>(null);
  const [diameterMm, setDiameterMm] = useState(18.14);
  const [fingerCircMm, setFingerCircMm] = useState(57);
  const [measures, setMeasures] = useState<ExploreMeasurements>({
    ringCircMm: null,
    fingerCircMm: null,
    cameraCircMm: null,
    ringSkipped: false,
  });
  const [verdict, setVerdict] = useState<SizeVerdict | null>(null);
  const [classifications, setClassifications] = useState<
    MeasureClassification[] | null
  >(null);
  const [hydrated, setHydrated] = useState(false);
  const [scanUrl, setScanUrl] = useState("/scan");
  const [copied, setCopied] = useState(false);
  const [askHaveRing, setAskHaveRing] = useState(false);

  useEffect(() => {
    setCalibration(loadCalibration());
    setMeasures(loadExploreMeasurements());
    if (typeof window !== "undefined") {
      setScanUrl(`${window.location.origin}/scan`);
    }
    setHydrated(true);
  }, []);

  const persist = (next: ExploreMeasurements) => {
    setMeasures(next);
    saveExploreMeasurements(next);
  };

  const goToRingStep = () => {
    setAskHaveRing(true);
    setStep("measure-ring");
  };

  const finishRing = () => {
    const circ = +diameterToCircumference(diameterMm).toFixed(1);
    persist({ ...measures, ringCircMm: circ, ringSkipped: false });
    setFingerCircMm(circ);
    setStep("measure-finger");
  };

  const skipRing = () => {
    setAskHaveRing(false);
    persist({ ...measures, ringCircMm: null, ringSkipped: true });
    setStep("measure-finger");
  };

  const finishFinger = () => {
    const circ = +fingerCircMm.toFixed(1);
    persist({ ...measures, fingerCircMm: circ });
    setStep("collect");
  };

  const showSize = () => {
    const finger = Number(measures.fingerCircMm);
    const camera = Number(measures.cameraCircMm);
    if (![finger, camera].every((v) => Number.isFinite(v) && v > 0)) return;

    const inputs = [];
    if (!measures.ringSkipped) {
      const ring = Number(measures.ringCircMm);
      if (!(Number.isFinite(ring) && ring > 0)) return;
      inputs.push({ key: "ring" as const, circMm: ring });
    }
    inputs.push(
      { key: "finger" as const, circMm: finger },
      { key: "camera" as const, circMm: camera }
    );

    const { verdict: next, classifications: cls } = decideSize(inputs);
    setVerdict(next);
    setClassifications(cls);
    setStep("result");
  };

  const restart = () => {
    clearExploreMeasurements();
    setMeasures({
      ringCircMm: null,
      fingerCircMm: null,
      cameraCircMm: null,
      ringSkipped: false,
    });
    setVerdict(null);
    setClassifications(null);
    setAskHaveRing(false);
    setStep("intro");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(scanUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const canSubmit =
    (Boolean(measures.ringSkipped) || Number(measures.ringCircMm) > 0) &&
    Number(measures.fingerCircMm) > 0 &&
    Number(measures.cameraCircMm) > 0;

  const progressIdx = Math.min(stepIndex[step], 4);

  return (
    <section className="scroll-mt-24 rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-9 shadow-[0_28px_70px_-32px_rgba(23,18,13,0.35)] sm:p-12">
      <div className="mb-8 border-b border-[var(--border)] pb-6">
        <ExploreProgress stepIndex={progressIdx} labels={PROGRESS_LABELS} />
      </div>

      <AnimatePresence mode="wait">
        {step === "intro" && (
          <StepFade stepKey="intro">
            <div className="space-y-8 text-center">
              <div className="flex justify-center">
                <RingMark size={81} />
              </div>
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-[33px] leading-tight text-[var(--ink)]">
                  Let&apos;s explore your size
                </h2>
                <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-[var(--muted)]">
                  Three measurements — a ring on screen if you have one, a
                  paper strip, then the camera on your phone. Each one is
                  checked against our fit zones, then we propose a size.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-left">
                {[
                  { n: "01", t: "Use a ring", d: "Optional — skip if none" },
                  { n: "02", t: "Measure finger", d: "Paper strip" },
                  { n: "03", t: "Camera", d: "On your phone" },
                ].map((item) => (
                  <div
                    key={item.n}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-5"
                  >
                    <p className="mono text-[10px] text-[var(--gold)]">{item.n}</p>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                      {item.t}
                    </p>
                    <p className="mono-label mt-2 text-[var(--muted)]">{item.d}</p>
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={!hydrated}
                onClick={() => setStep("calibrate")}
                className="gold-fill w-full rounded-xl px-6 py-4 text-base font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-[filter] hover:brightness-[1.04] disabled:opacity-50"
              >
                Start exploring ›
              </button>

              {calibration && (
                <button
                  type="button"
                  onClick={goToRingStep}
                  className="mono-label text-[var(--gold-deep)] underline underline-offset-4"
                >
                  Skip — screen already calibrated
                </button>
              )}
            </div>
          </StepFade>
        )}

        {step === "calibrate" && (
          <StepFade stepKey="calibrate">
            <CalibrateStep
              initial={calibration}
              onSaved={setCalibration}
              onBack={() => setStep("intro")}
              onContinue={goToRingStep}
            />
          </StepFade>
        )}

        {step === "measure-ring" && calibration && (
          <StepFade stepKey="measure-ring">
            <RingMeasure
              calibration={calibration}
              diameterMm={diameterMm}
              onDiameterChange={setDiameterMm}
              onBack={() => setStep("calibrate")}
              onRecalibrate={() => setStep("calibrate")}
              onSwitchFinger={() => {}}
              onResult={finishRing}
              onSkip={skipRing}
              guided
              nextLabel="Next step"
            />
          </StepFade>
        )}

        {step === "measure-finger" && calibration && (
          <StepFade stepKey="measure-finger">
            <FingerRuler
              calibration={calibration}
              circumferenceMm={fingerCircMm}
              onCircumferenceChange={setFingerCircMm}
              onBack={goToRingStep}
              onRecalibrate={() => setStep("calibrate")}
              onSwitchRing={() => {}}
              onResult={finishFinger}
              guided
              nextLabel="Next step"
            />
          </StepFade>
        )}

        {step === "collect" && (
          <StepFade stepKey="collect">
            <CollectStep
              measures={measures}
              scanUrl={scanUrl}
              copied={copied}
              canSubmit={canSubmit}
              onChange={persist}
              onCopy={copyLink}
              onBack={() => setStep("measure-finger")}
              onSubmit={showSize}
            />
          </StepFade>
        )}

        {step === "result" && verdict && (
          <StepFade stepKey="result">
            <ExploreResult
              verdict={verdict}
              classifications={classifications}
              measures={measures}
              onRestart={restart}
              onBack={() => setStep("collect")}
            />
          </StepFade>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {askHaveRing && (
          <HaveRingDialog
            onYes={() => setAskHaveRing(false)}
            onSkip={skipRing}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function HaveRingDialog({
  onYes,
  onSkip,
}: {
  onYes: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(23,18,13,0.55)] p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="have-ring-title"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] px-7 py-8 text-center shadow-[0_28px_70px_-24px_rgba(23,18,13,0.5)]"
      >
        <div className="flex justify-center">
          <RingMark size={56} />
        </div>
        <h3
          id="have-ring-title"
          className="mt-5 font-[family-name:var(--font-display)] text-[28px] leading-tight text-[var(--ink)]"
        >
          Do you have a ring?
        </h3>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
          If a ring already fits this finger, we can match it on screen. If you
          don&apos;t have one, skip this step — it won&apos;t count in your
          size.
        </p>
        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={onYes}
            className="gold-fill w-full rounded-xl px-5 py-3.5 text-base font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-[filter] hover:brightness-[1.04]"
          >
            Yes, I have a ring
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--surface)] px-5 py-3.5 text-base font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
          >
            I don&apos;t have a ring — skip
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ExploreProgress({
  stepIndex,
  labels,
}: {
  stepIndex: number;
  labels: string[];
}) {
  return (
    <ol className="flex items-center gap-1.5">
      {labels.map((label, i) => {
        const active = i === stepIndex;
        const done = i < stepIndex;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="flex min-w-0 items-center gap-1.5">
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
            </span>
            {i < labels.length - 1 && (
              <span className="h-px min-w-2 flex-1 bg-[var(--border)]" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function CollectStep({
  measures,
  scanUrl,
  copied,
  canSubmit,
  onChange,
  onCopy,
  onBack,
  onSubmit,
}: {
  measures: ExploreMeasurements;
  scanUrl: string;
  copied: boolean;
  canSubmit: boolean;
  onChange: (m: ExploreMeasurements) => void;
  onCopy: () => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const outlier = useMemo((): CircumferenceOutlier | null => {
    const finger = Number(measures.fingerCircMm);
    const camera = Number(measures.cameraCircMm);
    if (![finger, camera].every((v) => Number.isFinite(v) && v > 0)) {
      return null;
    }
    const ring =
      measures.ringSkipped || !(Number(measures.ringCircMm) > 0)
        ? null
        : Number(measures.ringCircMm);
    return findCircumferenceOutlier({ ring, finger, camera });
  }, [
    measures.ringCircMm,
    measures.fingerCircMm,
    measures.cameraCircMm,
    measures.ringSkipped,
  ]);

  return (
    <div className="space-y-6">
      <StepHeading title="Combine your measures">
        Enter each circumference in millimetres. Finish the camera scan on your
        phone, then type the Circ value here. Skip the ring if you don&apos;t
        have one.
      </StepHeading>

      {measures.ringSkipped ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="mono-label text-[var(--muted)]">1 · Using a ring</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            Skipped
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            You don&apos;t have a ring — this measure won&apos;t be used in
            your size result.
          </p>
          <button
            type="button"
            onClick={() =>
              onChange({ ...measures, ringSkipped: false, ringCircMm: null })
            }
            className="mono-label mt-3 text-[var(--gold-deep)] underline underline-offset-4"
          >
            I have a ring — enter a value
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <CircInput
            label="1 · Using a ring"
            hint="From the screen ring match"
            value={measures.ringCircMm}
            onChange={(v) =>
              onChange({ ...measures, ringCircMm: v, ringSkipped: false })
            }
            highlight={outlier?.key === "ring"}
          />
          <button
            type="button"
            onClick={() =>
              onChange({ ...measures, ringCircMm: null, ringSkipped: true })
            }
            className="w-full rounded-xl border-2 border-[var(--ink)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
          >
            I don&apos;t have a ring — skip
          </button>
        </div>
      )}
      <CircInput
        label="2 · Measure finger"
        hint="From the paper strip ruler"
        value={measures.fingerCircMm}
        onChange={(v) => onChange({ ...measures, fingerCircMm: v })}
        highlight={outlier?.key === "finger"}
      />

      <div
        className={`space-y-3 rounded-2xl border p-4 ${
          outlier?.key === "camera"
            ? "border-[var(--warn)] bg-[#fdf6ef]"
            : "border-[var(--border)] bg-[var(--surface-2)]"
        }`}
      >
        <p className="mono-label text-[var(--gold-deep)]">3 · Camera on your phone</p>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Open this link on your mobile to finish the camera scan, then enter
          the circumference it shows.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-xs text-[var(--ink)]">
            {scanUrl}
          </code>
          <button
            type="button"
            onClick={onCopy}
            className="gold-fill shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <CircInput
          label="Camera circumference"
          hint="Paste the Circ (mm) from your phone scan"
          value={measures.cameraCircMm}
          onChange={(v) => onChange({ ...measures, cameraCircMm: v })}
          bare
          highlight={outlier?.key === "camera"}
        />
      </div>

      {outlier && (
        <div
          role="alert"
          className="rounded-2xl border border-[var(--warn)] bg-[#fdf6ef] px-4 py-4 text-sm leading-relaxed text-[var(--ink)]"
        >
          <p className="mono-label text-[var(--warn)]">Adjust measure</p>
          <p className="mt-2">
            You have a problem on value{" "}
            <strong>
              {outlier.label} ({formatMm(outlier.valueMm)} mm)
            </strong>
            . Remeasure it again if you want a more accurate result.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)]"
        >
          ‹ Back
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="gold-fill flex-[1.4] rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] disabled:opacity-40"
        >
          Show me my size ›
        </button>
      </div>
    </div>
  );
}

function CircInput({
  label,
  hint,
  value,
  onChange,
  bare = false,
  highlight = false,
}: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (v: number | null) => void;
  bare?: boolean;
  highlight?: boolean;
}) {
  const inner = (
    <>
      <label className="mono-label text-[var(--muted)]">{label}</label>
      <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={40}
          max={90}
          step={0.1}
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") onChange(null);
            else onChange(+raw);
          }}
          placeholder="e.g. 57.0"
          className={`w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--gold)] ${
            highlight ? "border-[var(--warn)]" : "border-[var(--border)]"
          }`}
        />
        <span className="mono shrink-0 text-sm text-[var(--muted)]">mm</span>
      </div>
    </>
  );

  if (bare) return <div className="pt-1">{inner}</div>;
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight
          ? "border-[var(--warn)] bg-[#fdf6ef]"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      {inner}
    </div>
  );
}

const FIT_COPY: Record<FitLabel, { title: string; message: string }> = {
  perfect: {
    title: "Perfect",
    message: "Your measures agree — this size fits you perfectly.",
  },
  tight: {
    title: "Tight",
    message: "This size fits, but it may feel a little tight.",
  },
  loose: {
    title: "Loose",
    message: "This size fits, but it may feel a little loose.",
  },
  very_loose: {
    title: "Very loose",
    message: "This size is the closest we stock, but it will feel very loose.",
  },
  very_tight: {
    title: "Very tight",
    message: "This size is the closest we stock, but it will feel very tight.",
  },
};

const ZONE_STYLE: Record<
  MeasureClassification["color"],
  { chip: string; label: string }
> = {
  green: { chip: "bg-emerald-600", label: "Ok" },
  red: { chip: "bg-red-500", label: "Loose" },
  black: { chip: "bg-neutral-900", label: "Tight" },
};

const EXPERIENCE_FIT: Record<"ok" | "loose" | "tight", string> = {
  ok: "Ok",
  loose: "Loose",
  tight: "Tight",
};

function ExploreResult({
  verdict,
  classifications,
  measures,
  onRestart,
  onBack,
}: {
  verdict: SizeVerdict;
  classifications: MeasureClassification[] | null;
  measures: ExploreMeasurements;
  onRestart: () => void;
  onBack: () => void;
}) {
  const byKey = new Map((classifications ?? []).map((c) => [c.key, c]));
  const usedCount = classifications?.length ?? 0;
  const experiences = [
    {
      key: "ring" as const,
      label: "Ring",
      value: measures.ringCircMm,
      skipped: Boolean(measures.ringSkipped),
    },
    {
      key: "finger" as const,
      label: "Finger",
      value: measures.fingerCircMm,
      skipped: false,
    },
    {
      key: "camera" as const,
      label: "Camera",
      value: measures.cameraCircMm,
      skipped: false,
    },
  ];

  return (
    <div className="space-y-6">
      <StepHeading title="Your size result">
        Each completed measure is checked against the fit zones of our sizes —
        US 6 · 8 · 10 · 12.
      </StepHeading>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--stage)] px-4 py-8 sm:px-6">
        <p className="mono-label mb-6 text-center text-[var(--gold-light)]">
          Experience results
        </p>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {experiences.map((exp) => {
            const cls = byKey.get(exp.key);
            const skipped = exp.skipped || !cls;
            return (
              <div key={exp.key} className="text-center">
                <p className="mono-label text-[#8c7c66]">{exp.label}</p>
                {skipped ? (
                  <>
                    <p className="mt-3 font-[family-name:var(--font-display)] text-xl text-white/55 sm:text-2xl">
                      Skipped
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-[#8c7c66]">
                      No size result
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 font-[family-name:var(--font-display)] text-3xl text-[var(--gold-light)] sm:text-4xl">
                      US {cls.us}
                    </p>
                    <p className="mt-2 font-[family-name:var(--font-display)] text-lg text-white">
                      {EXPERIENCE_FIT[fitFromColor(cls.color)]}
                    </p>
                    <p className="mono mt-2 text-[11px] text-[#8c7c66]">
                      {formatMm(exp.value ?? cls.circMm)} mm
                    </p>
                    <p className="mt-2 flex items-center justify-center gap-1.5">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${ZONE_STYLE[cls.color].chip}`}
                        aria-hidden
                      />
                      <span className="mono text-[10px] text-[#8c7c66]">
                        {ZONE_STYLE[cls.color].label}
                      </span>
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-8 text-center">
        {verdict.status === "size" && (
          <>
            <p className="mono-label text-[var(--gold-deep)]">
              Based on {usedCount} measure{usedCount === 1 ? "" : "s"} we
              propose
            </p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-5xl text-[var(--gold)] sm:text-6xl">
              US {verdict.us}
            </p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
              {FIT_COPY[verdict.fit].title}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
              {FIT_COPY[verdict.fit].message}
            </p>
          </>
        )}
        {verdict.status === "remeasure" && (
          <>
            <p className="mono-label text-[var(--gold-deep)]">
              Based on {usedCount} measure{usedCount === 1 ? "" : "s"}
            </p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
              Choose another finger and remeasure
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
              Your values don&apos;t point to a good fit. Please choose another
              finger and remeasure — thank you.
            </p>
          </>
        )}
        {verdict.status === "unavailable" && (
          <>
            <p className="mono-label text-[var(--gold-deep)]">
              Based on {usedCount} measure{usedCount === 1 ? "" : "s"}
            </p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
              Your size is not available
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
              Your measures are below our smallest size. Available sizes are US
              6 · 8 · 10 · 12 only.
            </p>
          </>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm"
        >
          ‹ Adjust inputs
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="gold-fill flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
