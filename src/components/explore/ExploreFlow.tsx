"use client";

import { AnimatePresence } from "framer-motion";
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
  loadExploreMeasurements,
  saveExploreMeasurements,
  type CircClassification,
  type CircumferenceOutlier,
  type ExploreMeasurements,
  type FitLabel,
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
  });
  const [verdict, setVerdict] = useState<SizeVerdict | null>(null);
  const [classifications, setClassifications] = useState<
    CircClassification[] | null
  >(null);
  const [hydrated, setHydrated] = useState(false);
  const [scanUrl, setScanUrl] = useState("/scan");
  const [copied, setCopied] = useState(false);

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

  const finishRing = () => {
    const circ = +diameterToCircumference(diameterMm).toFixed(1);
    persist({ ...measures, ringCircMm: circ });
    setFingerCircMm(circ);
    setStep("measure-finger");
  };

  const finishFinger = () => {
    const circ = +fingerCircMm.toFixed(1);
    persist({ ...measures, fingerCircMm: circ });
    setStep("collect");
  };

  const showSize = () => {
    const ring = Number(measures.ringCircMm);
    const finger = Number(measures.fingerCircMm);
    const camera = Number(measures.cameraCircMm);
    if (![ring, finger, camera].every((v) => Number.isFinite(v) && v > 0)) return;

    const { verdict: next, classifications: cls } = decideSize([
      ring,
      finger,
      camera,
    ]);
    setVerdict(next);
    setClassifications(cls);
    setStep("result");
  };

  const restart = () => {
    clearExploreMeasurements();
    setMeasures({ ringCircMm: null, fingerCircMm: null, cameraCircMm: null });
    setVerdict(null);
    setClassifications(null);
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
    Number(measures.ringCircMm) > 0 &&
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
                  Three measurements — ring on screen, paper strip, then camera
                  on your phone — then we check each one against our fit zones
                  to find your best size.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-left">
                {[
                  { n: "01", t: "Use a ring", d: "Match on screen" },
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
                  onClick={() => setStep("measure-ring")}
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
              onContinue={() => setStep("measure-ring")}
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
              onBack={() => setStep("measure-ring")}
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
    </section>
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
    const ring = Number(measures.ringCircMm);
    const finger = Number(measures.fingerCircMm);
    const camera = Number(measures.cameraCircMm);
    if (![ring, finger, camera].every((v) => Number.isFinite(v) && v > 0)) {
      return null;
    }
    return findCircumferenceOutlier({ ring, finger, camera });
  }, [measures.ringCircMm, measures.fingerCircMm, measures.cameraCircMm]);

  return (
    <div className="space-y-6">
      <StepHeading title="Combine your three measures">
        Enter each circumference in millimetres. Finish the camera scan on your
        phone, then type the Circ value here.
      </StepHeading>

      <CircInput
        label="1 · Using a ring"
        hint="From the screen ring match"
        value={measures.ringCircMm}
        onChange={(v) => onChange({ ...measures, ringCircMm: v })}
        highlight={outlier?.key === "ring"}
      />
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
    message: "All three measures agree — this size fits you perfectly.",
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
  CircClassification["color"],
  { chip: string; label: string }
> = {
  green: { chip: "bg-emerald-600", label: "Green · ok" },
  red: { chip: "bg-red-500", label: "Red · loose" },
  black: { chip: "bg-neutral-900", label: "Black · tight" },
};

function ExploreResult({
  verdict,
  classifications,
  measures,
  onRestart,
  onBack,
}: {
  verdict: SizeVerdict;
  classifications: CircClassification[] | null;
  measures: ExploreMeasurements;
  onRestart: () => void;
  onBack: () => void;
}) {
  const cards = [
    { l: "Ring", v: measures.ringCircMm, cls: classifications?.[0] },
    { l: "Finger", v: measures.fingerCircMm, cls: classifications?.[1] },
    { l: "Camera", v: measures.cameraCircMm, cls: classifications?.[2] },
  ];

  return (
    <div className="space-y-6">
      <StepHeading title="Your size result">
        Each measure is checked against the fit zones of our sizes — US 6 · 8 ·
        10 · 12.
      </StepHeading>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--stage)] px-6 py-10 text-center">
        {verdict.status === "size" && (
          <>
            <p className="mono-label text-[var(--gold-light)]">Your size</p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-6xl text-[var(--gold-light)]">
              US {verdict.us}
            </p>
            <p className="mt-4 font-[family-name:var(--font-display)] text-2xl text-white">
              {FIT_COPY[verdict.fit].title}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#8c7c66]">
              {FIT_COPY[verdict.fit].message}
            </p>
          </>
        )}
        {verdict.status === "remeasure" && (
          <>
            <p className="mono-label text-[var(--gold-light)]">
              Measures don&apos;t agree
            </p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white">
              Choose another finger and remeasure
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#8c7c66]">
              Your three values don&apos;t point to a good fit. Please choose
              another finger and remeasure — thank you.
            </p>
          </>
        )}
        {verdict.status === "unavailable" && (
          <>
            <p className="mono-label text-[var(--gold-light)]">Out of range</p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white">
              Your size is not available
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#8c7c66]">
              Your measures are below our smallest size. Available sizes are US
              6 · 8 · 10 · 12 only.
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {cards.map((c) => (
          <div
            key={c.l}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-center"
          >
            <p className="mono-label text-[var(--muted)]">{c.l}</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-lg">
              {c.v != null ? `${formatMm(c.v)} mm` : "—"}
            </p>
            {c.cls && (
              <p className="mt-1.5 flex items-center justify-center gap-1.5">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${ZONE_STYLE[c.cls.color].chip}`}
                  aria-hidden
                />
                <span className="mono text-[10px] text-[var(--muted)]">
                  {ZONE_STYLE[c.cls.color].label}
                </span>
              </p>
            )}
          </div>
        ))}
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
