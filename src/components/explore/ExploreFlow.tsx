"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useId, useState } from "react";
import { RingMark } from "@/components/RingMark";
import { UiIcon } from "@/components/UiIcon";
import { SensorRing } from "@/components/SensorRing";
import { CalibrateStep } from "@/components/sizer/CalibrateStep";
import { FingerRuler } from "@/components/sizer/FingerRuler";
import { RingMeasure } from "@/components/sizer/RingMeasure";
import { FingerPlanStep, fingerPhrase, nextFingerAdvice } from "@/components/explore/FingerPlanStep";
import { ProgressSteps, StepFade, StepHeading } from "@/components/sizer/WizardShell";
import { diameterToCircumference } from "@/lib/convert";
import {
  loadCalibration,
  type StoredCalibration,
} from "@/lib/calibration";
import {
  activeFingerIndex,
  validFingerPlan,
  classifyCircumference,
  consensusSize,
  fitBandFor,
  fitGuidance,
  COMPETITOR_US_SIZES,
  stockedFromCompetitorUs,
  loadExploreMeasurements,
  saveExploreMeasurements,
  type ExploreMeasurements,
  type FingerPick,
  type MeasureClassification,
  type SizeVerdict,
} from "@/lib/explore-flow";

type Step =
  | "intro"
  | "measure-hand"
  | "calibrate"
  | "measure-ring"
  | "measure-finger"
  | "measure-jeweler"
  | "measure-competitor"
  | "reading"
  | "result"
  | "confirm";

type ReadingKey = "jeweler" | "competitor" | "ring" | "finger";

const stepIndex: Record<Exclude<Step, "reading">, number> = {
  intro: 0,
  "measure-hand": 0,
  "measure-jeweler": 1,
  "measure-competitor": 2,
  calibrate: 3,
  "measure-ring": 3,
  "measure-finger": 4,
  result: 5,
  confirm: 5,
};

const readingIndex: Record<ReadingKey, number> = {
  jeweler: 1,
  competitor: 2,
  ring: 3,
  finger: 4,
};

const READING_LABEL: Record<ReadingKey, string> = {
  jeweler: "Jeweler size",
  competitor: "Competitor size",
  ring: "Ring on screen",
  finger: "Paper strip",
};

const PROGRESS_LABELS = ["Finger", "Jeweler", "Compare", "Ring", "Strip", "Size"];

const EMPTY: ExploreMeasurements = {
  ringCircMm: null,
  fingerCircMm: null,
  jewelerCircMm: null,
  competitorCircMm: null,
  ringSkipped: false,
  fingerSkipped: false,
  jewelerSkipped: false,
  competitorSkipped: false,
};

const primaryBtn =
  "btn-primary w-full";

function formatReading(mm: number): string {
  const hundredths = mm.toFixed(2);
  return hundredths.endsWith("0") ? mm.toFixed(1) : hundredths;
}

export function ExploreFlow() {
  const [step, setStep] = useState<Step>("intro");
  const [calibration, setCalibration] = useState<StoredCalibration | null>(null);
  const [diameterMm, setDiameterMm] = useState(18.14);
  const [fingerCircMm, setFingerCircMm] = useState(57);
  const [jewelerDraft, setJewelerDraft] = useState<number | null>(null);
  const [competitorDraft, setCompetitorDraft] = useState<number | null>(null);
  const [measures, setMeasures] = useState<ExploreMeasurements>(EMPTY);
  const [verdict, setVerdict] = useState<SizeVerdict | null>(null);
  const [sure, setSure] = useState(false);
  const [classifications, setClassifications] = useState<
    MeasureClassification[] | null
  >(null);
  const [hydrated, setHydrated] = useState(false);
  const [askHaveRing, setAskHaveRing] = useState(false);
  const [askStrip, setAskStrip] = useState(false);
  const [showStripGuide, setShowStripGuide] = useState(false);
  const [askJeweler, setAskJeweler] = useState(false);
  const [askCompetitor, setAskCompetitor] = useState(false);
  const [readingKey, setReadingKey] = useState<ReadingKey | null>(null);
  const [wearPicks, setWearPicks] = useState<FingerPick[]>([]);

  useEffect(() => {
    setCalibration(loadCalibration());
    const saved = loadExploreMeasurements();
    setMeasures(saved);
    setJewelerDraft(saved.jewelerCircMm);
    setCompetitorDraft(saved.competitorUs ?? null);
    setWearPicks(saved.wearPicks?.length ? saved.wearPicks.map((pick) => ({ ...pick })) : []);
    setHydrated(true);
  }, []);

  const persist = (next: ExploreMeasurements) => {
    setMeasures(next);
    saveExploreMeasurements(next);
  };

  const bothReferenceSkipped = (source: ExploreMeasurements) =>
    Boolean(source.jewelerSkipped && source.competitorSkipped);

  const goToRingStep = (source: ExploreMeasurements = measures) => {
    setAskHaveRing(!bothReferenceSkipped(source));
    setStep("measure-ring");
  };

  const goToStrip = (source: ExploreMeasurements = measures) => {
    const required = bothReferenceSkipped(source);
    setAskStrip(!required);
    setShowStripGuide(required && !(Number(source.fingerCircMm) > 0 && !source.fingerSkipped));
    setStep("measure-finger");
  };

  const goToHand = () => setStep("measure-hand");

  const saveHand = () => {
    if (!validFingerPlan(wearPicks)) return;
    resetMeasurements({ ...EMPTY, wearPicks: wearPicks.map((pick) => ({ ...pick })), activeFingerIndex: 0 }, "measure-jeweler");
  };

  const goToCompetitor = () => {
    setAskCompetitor(true);
    setStep("measure-competitor");
  };

  const openReading = (key: ReadingKey, next: ExploreMeasurements) => {
    persist(next);
    setReadingKey(key);
    setStep("reading");
  };

  const finishRing = () => {
    const circ = +diameterToCircumference(diameterMm).toFixed(1);
    setFingerCircMm(circ);
    openReading("ring", { ...measures, ringCircMm: circ, ringSkipped: false });
  };

  const skipRing = () => {
    if (bothReferenceSkipped(measures)) return;
    setAskHaveRing(false);
    const next = { ...measures, ringCircMm: null, ringSkipped: true };
    persist(next);
    goToStrip(next);
  };

  const finishFinger = () => {
    const circ = +fingerCircMm.toFixed(1);
    openReading("finger", { ...measures, fingerCircMm: circ, fingerSkipped: false });
  };

  const skipFinger = () => {
    if (bothReferenceSkipped(measures)) return;
    setAskStrip(false);
    setShowStripGuide(false);
    const next = { ...measures, fingerCircMm: null, fingerSkipped: true };
    persist(next);
    showSize(next);
  };

  const goAfterCompetitor = (source: ExploreMeasurements = measures) => {
    if (calibration) goToRingStep(source);
    else setStep("calibrate");
  };

  const saveJeweler = () => {
    if (!(Number(jewelerDraft) > 0)) return;
    openReading("jeweler", {
      ...measures,
      jewelerCircMm: Number(jewelerDraft),
      jewelerSkipped: false,
    });
  };

  const skipJeweler = () => {
    setAskJeweler(false);
    persist({ ...measures, jewelerCircMm: null, jewelerSkipped: true });
    goToCompetitor();
  };

  const saveCompetitor = () => {
    const entered = Number(competitorDraft);
    const stocked = stockedFromCompetitorUs(entered);
    if (!stocked) return;
    const tooLarge = stocked === "smaller-finger";
    openReading("competitor", {
      ...measures,
      competitorUs: entered,
      competitorTooLarge: tooLarge,
      competitorCircMm: tooLarge ? null : fitBandFor(stocked).referenceMm,
      competitorSkipped: false,
    });
  };

  const skipCompetitor = () => {
    setAskCompetitor(false);
    const next = { ...measures, competitorCircMm: null, competitorUs: null, competitorTooLarge: false, competitorSkipped: true };
    persist(next);
    goAfterCompetitor(next);
  };

  const showSize = (source: ExploreMeasurements = measures) => {
    if (!validFingerPlan(source.wearPicks)) {
      goToHand();
      return;
    }
    const inputs = [
      !source.ringSkipped && Number(source.ringCircMm) > 0
        ? { key: "ring" as const, circMm: Number(source.ringCircMm) }
        : null,
      !source.fingerSkipped && Number(source.fingerCircMm) > 0
        ? { key: "finger" as const, circMm: Number(source.fingerCircMm) }
        : null,
      !source.jewelerSkipped && Number(source.jewelerCircMm) > 0
        ? { key: "jeweler" as const, circMm: Number(source.jewelerCircMm) }
        : null,
      !source.competitorSkipped && Number(source.competitorCircMm) > 0
        ? { key: "competitor" as const, circMm: Number(source.competitorCircMm) }
        : null,
    ].filter((item): item is { key: "ring" | "finger" | "jeweler" | "competitor"; circMm: number } => item != null);

    if (bothReferenceSkipped(source)) {
      if (!(Number(source.ringCircMm) > 0 && !source.ringSkipped)) {
        goToRingStep(source);
        return;
      }
      if (!(Number(source.fingerCircMm) > 0 && !source.fingerSkipped)) {
        goToStrip(source);
        return;
      }
    }

    if (!inputs.length) {
      setVerdict({ status: "remeasure" });
      setClassifications([]);
      setSure(false);
      setStep("result");
      return;
    }
    const { verdict: next, classifications: cls, sure: agreed } = consensusSize(inputs);
    setVerdict(next);
    setClassifications(cls);
    setSure(agreed);
    setStep("result");
  };

  const resetMeasurements = (kept: ExploreMeasurements, target: Step) => {
    saveExploreMeasurements(kept);
    setMeasures(kept);
    setJewelerDraft(null);
    setCompetitorDraft(null);
    setVerdict(null);
    setClassifications(null);
    setSure(false);
    setAskHaveRing(false);
    setAskStrip(false);
    setShowStripGuide(false);
    setAskJeweler(false);
    setAskCompetitor(false);
    setReadingKey(null);
    setDiameterMm(18.14);
    setFingerCircMm(57);
    setStep(target);
    if (target === "measure-jeweler") setAskJeweler(true);
  };

  const repeatFinger = () => resetMeasurements({
    ...EMPTY, wearPicks: measures.wearPicks,
    activeFingerIndex: activeFingerIndex(measures),
  }, "measure-jeweler");

  const moveToNextFinger = () => {
    if (!validFingerPlan(measures.wearPicks) || activeFingerIndex(measures) >= 2) {
      goToHand();
      return;
    }
    resetMeasurements({ ...EMPTY, wearPicks: measures.wearPicks,
      activeFingerIndex: activeFingerIndex(measures) + 1,
    }, "measure-jeweler");
  };

  const restart = () => resetMeasurements({ ...EMPTY }, "intro");

  const readingValue = (key: ReadingKey) => {
    if (key === "jeweler") return measures.jewelerCircMm;
    if (key === "competitor") return measures.competitorCircMm;
    if (key === "ring") return measures.ringCircMm;
    return measures.fingerCircMm;
  };

  const continueReading = () => {
    if (readingKey === "jeweler") goToCompetitor();
    else if (readingKey === "competitor") goAfterCompetitor();
    else if (readingKey === "ring") goToStrip();
    else showSize();
  };

  const backFromReading = () => {
    if (readingKey === "jeweler") {
      setAskJeweler(false);
      setStep("measure-jeweler");
    } else if (readingKey === "competitor") {
      setAskCompetitor(false);
      setStep("measure-competitor");
    } else if (readingKey === "ring") {
      setAskHaveRing(false);
      setStep("measure-ring");
    } else {
      setAskStrip(false);
      setStep("measure-finger");
    }
  };

  const progressIdx = step === "reading" ? readingIndex[readingKey ?? "jeweler"] : stepIndex[step];

  return (
    <section className="wizard-card">
      <div>
        <ProgressSteps stepIndex={progressIdx} labels={PROGRESS_LABELS} />
      </div>

      {!["intro", "measure-hand"].includes(step) && measures.wearPicks?.[activeFingerIndex(measures)] && (
        <p className="my-4 text-center text-sm text-[var(--ink)]" aria-live="polite">
          Measuring your {fingerPhrase(measures.wearPicks[activeFingerIndex(measures)].hand, measures.wearPicks[activeFingerIndex(measures)].finger)}
          <span className="ml-2 text-[var(--muted)]">Choice {activeFingerIndex(measures) + 1} of 3</span>
        </p>
      )}
      <AnimatePresence mode="wait">
        {step === "intro" && (
          <StepFade stepKey="intro">
            <div className="space-y-8 text-center">
              <div className="mx-auto w-32">
                <SensorRing tone="light" />
              </div>
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-[33px] leading-tight text-[var(--ink)]">
                  Let’s find your fit
                </h2>
                <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-[var(--muted)]">
                  Add the measurements you have. Skip any you don’t.
                </p>
              </div>

              <button
                type="button"
                disabled={!hydrated}
                onClick={goToHand}
                className={primaryBtn}
              >
                Get started <UiIcon name="arrow" />
              </button>
            </div>
          </StepFade>
        )}

        {step === "measure-hand" && (
          <StepFade stepKey="measure-hand">
            <FingerPlanStep
              picks={wearPicks}
              onPicksChange={setWearPicks}
              onBack={() => setStep("intro")}
              onContinue={saveHand}
            />
          </StepFade>
        )}

        {step === "calibrate" && (
          <StepFade stepKey="calibrate">
            <CalibrateStep
              initial={calibration}
              onSaved={setCalibration}
              onBack={goToCompetitor}
              onContinue={goToRingStep}
            />
          </StepFade>
        )}

        {step === "measure-ring" && calibration && (
          <StepFade stepKey={askHaveRing ? "ring-choice" : "measure-ring"}>
            {askHaveRing ? (
              <HaveRingChoice onYes={() => setAskHaveRing(false)} onSkip={skipRing} />
            ) : <>
            {bothReferenceSkipped(measures) && (
              <p className="mb-4 text-center text-sm leading-relaxed text-[var(--muted)]">
                Ring measure and the paper strip are both required.
              </p>
            )}
            <RingMeasure
              calibration={calibration}
              diameterMm={diameterMm}
              onDiameterChange={setDiameterMm}
              onBack={() => setStep("calibrate")}
              onRecalibrate={() => setStep("calibrate")}
              onSwitchFinger={() => {}}
              onResult={finishRing}
              onSkip={bothReferenceSkipped(measures) ? undefined : skipRing}
              guided
              nextLabel="Save ring size"
            />
            </>}
          </StepFade>
        )}

        {step === "measure-finger" && calibration && (
          <StepFade stepKey={askStrip ? "strip-choice" : "measure-finger"}>
            {askStrip ? (
              <HaveValueChoice
                title="Measure with a paper strip?"
                body="Wrap a strip of paper around your finger and mark where it overlaps."
                yesLabel="Yes, show me how"
                noLabel="Skip paper strip"
                onYes={() => setShowStripGuide(true)}
                onNo={skipFinger}
              />
            ) : (
              <>
              {bothReferenceSkipped(measures) && (
                <p className="mb-4 text-center text-sm leading-relaxed text-[var(--muted)]">
                  Ring measure and the paper strip are both required.
                </p>
              )}
              <FingerRuler
                calibration={calibration}
                circumferenceMm={fingerCircMm}
                onCircumferenceChange={setFingerCircMm}
                onBack={goToRingStep}
                onRecalibrate={() => setStep("calibrate")}
                onSwitchRing={() => {}}
                onResult={finishFinger}
                guided
                nextLabel="Save strip length"
              />
              </>
            )}
          </StepFade>
        )}

        {step === "measure-jeweler" && (
          <StepFade stepKey={askJeweler ? "jeweler-choice" : "measure-jeweler"}>
            {askJeweler ? (
              <HaveValueChoice
                title="Do you have a jeweler size?"
                body="Use the circumference in millimetres from a jeweler, if you have one."
                yesLabel="Yes, I have it"
                noLabel="No jeweler size"
                onYes={() => setAskJeweler(false)}
                onNo={skipJeweler}
                onBack={goToHand}
              />
            ) : (
              <ManualCircStep
                title="Jeweler size"
                body="Enter the circumference they gave you."
                value={jewelerDraft}
                onChange={setJewelerDraft}
                onBack={() => setAskJeweler(true)}
                onSave={saveJeweler}
                saveLabel="Save jeweler size"
              />
            )}
          </StepFade>
        )}

        {step === "measure-competitor" && (
          <StepFade stepKey={askCompetitor ? "competitor-choice" : "measure-competitor"}>
            {askCompetitor ? (
              <HaveValueChoice
                title="Do you have a competitor size?"
                body="Use the US size from another ring brand, from US 5 to US 14."
                yesLabel="Yes, I have it"
                noLabel="No competitor size"
                onYes={() => setAskCompetitor(false)}
                onNo={skipCompetitor}
              />
            ) : (
              <CompetitorSizeStep
                value={competitorDraft}
                onChange={setCompetitorDraft}
                onBack={() => setAskCompetitor(true)}
                onSave={saveCompetitor}
              />
            )}
          </StepFade>
        )}

        {step === "reading" && readingKey && (
          <StepFade stepKey={`reading-${readingKey}`}>
            <StepReading
              label={READING_LABEL[readingKey]}
              mm={readingKey === "competitor" ? null : readingValue(readingKey)}
              picked={readingKey === "competitor" ? { entered: measures.competitorUs ?? null, tooLarge: Boolean(measures.competitorTooLarge) } : null}
              continueLabel={readingKey === "finger" ? "See my size" : "Continue"}
              onBack={backFromReading}
              onContinue={continueReading}
            />
          </StepFade>
        )}

        {step === "result" && verdict && (
          <StepFade stepKey="result">
            <ExploreResult
              verdict={verdict}
              sure={sure}
              classifications={classifications}
              measures={measures}
              onRestart={repeatFinger}
              onNextFinger={moveToNextFinger}
              onBack={goToStrip}
              onConfirm={() => setStep("confirm")}
            />
          </StepFade>
        )}

        {step === "confirm" && verdict?.status === "size" && (
          <StepFade stepKey="confirm">
            <ConfirmFit
              us={verdict.us}
              onRestart={restart}
            />
          </StepFade>
        )}
      </AnimatePresence>

      {showStripGuide && (
        <PaperStripGuide
          onReady={() => {
            setShowStripGuide(false);
            setAskStrip(false);
          }}
          onClose={() => setShowStripGuide(false)}
        />
      )}

    </section>
  );
}

function HaveRingChoice({
  onYes,
  onSkip,
}: {
  onYes: () => void;
  onSkip: () => void;
}) {
  return (
      <div className="py-5 text-center">
        <div className="intro-icon">
          <RingMark size={56} />
        </div>
        <h2
          id="have-ring-title"
          className="mt-5 font-[family-name:var(--font-display)] text-[28px] leading-tight text-[var(--ink)]"
        >
          Do you have a ring?
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
          Use a ring that fits this finger.
        </p>
        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={onYes}
            className={primaryBtn}
          >
            Yes, use my ring
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="btn-secondary w-full"
          >
            No ring? Skip
          </button>
        </div>
      </div>
  );
}

function HaveValueChoice({
  title,
  body,
  yesLabel,
  noLabel,
  onYes,
  onNo,
  onBack,
}: {
  title: string;
  body: string;
  yesLabel: string;
  noLabel: string;
  onYes: () => void;
  onNo: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="py-5 text-center">
      <h2 className="font-[family-name:var(--font-display)] text-[28px] leading-tight text-[var(--ink)]">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">{body}</p>
      <div className="mt-7 flex flex-col gap-3">
        <button type="button" onClick={onYes} className={primaryBtn}>{yesLabel}</button>
        <button type="button" onClick={onNo} className="btn-secondary w-full">{noLabel}</button>
        {onBack && (
          <button type="button" onClick={onBack} className="text-sm text-[var(--muted)] underline-offset-4 hover:underline">
            ‹ Back
          </button>
        )}
      </div>
    </div>
  );
}

function CompetitorSizeStep({
  value,
  onChange,
  onBack,
  onSave,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const inputId = useId();
  return (
    <div className="space-y-6">
      <StepHeading title="Competitor size">Enter the US size from the other brand.</StepHeading>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <label htmlFor={inputId} className="mono-label text-[var(--muted)]">US size</label>
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-[var(--muted)]">US 5 to US 14</p>
        <select
          id={inputId}
          aria-describedby={`${inputId}-hint`}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-lg text-[var(--ink)] outline-none focus:border-[var(--gold)]"
        >
          <option value="">Select a size</option>
          {COMPETITOR_US_SIZES.map((size) => (
            <option key={size} value={size}>US {size}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="btn-secondary flex-1">‹ Back</button>
        <button type="button" onClick={onSave} disabled={stockedFromCompetitorUs(Number(value)) == null} className="btn-primary flex-[1.4]">Save competitor size</button>
      </div>
    </div>
  );
}

function ManualCircStep({
  title,
  body,
  value,
  onChange,
  onBack,
  onSave,
  saveLabel,
}: {
  title: string;
  body: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onBack: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div className="space-y-6">
      <StepHeading title={title}>{body}</StepHeading>
      <CircInput label="Circumference" hint="Millimetres" value={value} onChange={onChange} />
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="btn-secondary flex-1">‹ Back</button>
        <button type="button" onClick={onSave} disabled={!(Number(value) > 0)} className="btn-primary flex-[1.4]">{saveLabel}</button>
      </div>
    </div>
  );
}

const STRIP_STEPS = [
  { title: "Cut a strip", text: "Use a thin piece of paper." },
  { title: "Wrap your finger", text: "Snug is right. Not tight, and not loose." },
  { title: "Mark the overlap", text: "Put a pen mark where the paper meets, as in the photo." },
  { title: "Measure that mark", text: "Lay the strip flat and match its length on the next screen." },
];

function PaperStripGuide({ onReady, onClose }: { onReady: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#243e35]/55 p-3 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="strip-guide-title"
        className="flex max-h-[min(720px,92dvh)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-[var(--surface)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <p className="mono-label text-[var(--gold-deep)]">Paper strip</p>
            <h2 id="strip-guide-title" className="mt-1 font-[family-name:var(--font-display)] text-[28px] leading-tight text-[var(--ink)]">
              Measure your finger
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-lg text-[var(--ink)] hover:bg-[var(--surface-2)]">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-2">
          <img
            src="/paper-strip-method.png"
            alt="A paper strip wrapped around a finger, with a pen mark where the ends overlap."
            className="mt-3 max-h-[280px] w-full rounded-[28px] bg-[var(--surface-2)] object-contain"
          />
          <ol className="mt-3 space-y-2.5">
            {STRIP_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-xs text-white">{index + 1}</span>
                <p className="pt-0.5 text-sm leading-relaxed text-[var(--ink)]">
                  <span className="font-medium">{step.title}.</span>{" "}
                  <span className="text-[var(--muted)]">{step.text}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
        <div className="border-t border-[var(--border)] px-5 py-4">
          <button type="button" onClick={onReady} className={primaryBtn}>Measure my strip</button>
        </div>
      </div>
    </div>
  );
}

function StepReading({
  label,
  mm,
  picked,
  continueLabel,
  onBack,
  onContinue,
}: {
  label: string;
  mm: number | null;
  picked?: { entered: number | null; tooLarge: boolean } | null;
  continueLabel: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const stocked = picked?.entered != null ? stockedFromCompetitorUs(picked.entered) : null;
  const pickedSize = stocked && stocked !== "smaller-finger" ? stocked : null;
  if (!picked && !(Number(mm) > 0)) return null;
  const zone = picked ? null : classifyCircumference(mm!);
  const style = zone ? ZONE_STYLE[zone.color] : ZONE_STYLE.green;
  return (
    <div className="space-y-6 text-center">
      <div className="result-hero space-y-3">
        <p className="mono-label text-[var(--muted)]">{label}</p>
        {picked?.tooLarge || stocked === "smaller-finger" ? (
          <>
            <p className="font-[family-name:var(--font-display)] text-5xl leading-none text-[var(--ink)]">US {picked?.entered}</p>
            <p className="text-base leading-relaxed text-[var(--ink)]">Choose another smaller finger.</p>
          </>
        ) : (
          <>
            <p className="font-[family-name:var(--font-display)] text-6xl leading-none text-[var(--ink)]">US {pickedSize ?? zone?.us}</p>
            {picked && picked.entered != null && picked.entered !== pickedSize ? (
              <p className="text-sm text-[var(--muted)]">From US {picked.entered}</p>
            ) : zone ? (
              <p className="text-lg tabular-nums text-[var(--ink)]">{formatReading(mm!)} <span className="text-sm text-[var(--muted)]">mm</span></p>
            ) : null}
            <p className="flex items-center justify-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${style.chip}`} aria-hidden />
              <span className="text-sm text-[var(--ink)]">{picked ? "Ok" : style.label}</span>
            </p>
          </>
        )}
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="btn-secondary flex-1">‹ Back</button>
        <button type="button" onClick={onContinue} className="btn-primary flex-[1.4]">{continueLabel}</button>
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
  const inputId = useId();
  const inner = (
    <>
      <label htmlFor={inputId} className="mono-label text-[var(--muted)]">{label}</label>
      <p id={`${inputId}-hint`} className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={inputId}
          aria-describedby={`${inputId}-hint`}
          aria-invalid={highlight || undefined}
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
          className={`min-w-0 w-full rounded-lg border bg-[var(--surface)] px-3 py-3 text-lg tabular-nums text-[var(--ink)] outline-none focus:border-[var(--gold)] ${
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

const ZONE_STYLE: Record<
  MeasureClassification["color"],
  { chip: string; label: string }
> = {
  green: { chip: "bg-emerald-600", label: "Ok" },
  red: { chip: "bg-red-500", label: "Loose" },
  black: { chip: "bg-neutral-900", label: "Tight" },
};

function ExploreResult({
  verdict,
  sure,
  classifications,
  measures,
  onRestart,
  onNextFinger,
  onBack,
  onConfirm,
}: {
  verdict: SizeVerdict;
  sure: boolean;
  classifications: MeasureClassification[] | null;
  measures: ExploreMeasurements;
  onRestart: () => void;
  onBack: () => void;
  onConfirm: () => void;
  onNextFinger: () => void;
}) {
  const byKey = new Map((classifications ?? []).map((c) => [c.key, c]));
  const lowest = classifications?.length
    ? Math.min(...classifications.map((c) => c.circMm))
    : undefined;
  const guidance =
    verdict.status === "size"
      ? fitGuidance(verdict.fit, verdict.us, lowest)
      : null;
  const okCount = (classifications ?? []).filter((c) => c.color === "green").length;
  const readingCount = classifications?.length ?? 0;
  const measuresAreTight =
    readingCount > 0 &&
    (classifications ?? []).every((c) => c.color === "black");
  const tryAnotherFinger =
    (verdict.status === "size" &&
      (verdict.fit === "tight" || verdict.fit === "very_tight" || verdict.fit === "loose" || verdict.fit === "very_loose")) ||
    (verdict.status === "remeasure" && measuresAreTight);
  const competitorBlocksSize = Boolean(measures.competitorTooLarge);
  const nextFinger = nextFingerAdvice(measures.wearPicks, activeFingerIndex(measures));
  const tightBody = nextFinger?.body ?? "All three selected fingers have been tried. Choose a new set of three fingers to continue.";
  const tightAction = nextFinger?.action ?? "Choose three new fingers";
  const experiences = [
    { key: "jeweler" as const, label: "Jeweler size", value: measures.jewelerCircMm, skipped: Boolean(measures.jewelerSkipped) },
    { key: "competitor" as const, label: "Competitor size", value: measures.competitorCircMm, skipped: Boolean(measures.competitorSkipped) },
    { key: "ring" as const, label: "Ring on screen", value: measures.ringCircMm, skipped: Boolean(measures.ringSkipped) },
    { key: "finger" as const, label: "Paper strip", value: measures.fingerCircMm, skipped: Boolean(measures.fingerSkipped) },
  ].filter((exp) => !exp.skipped && (Number(exp.value) > 0 || (exp.key === "competitor" && measures.competitorTooLarge)));

  return (
    <div className="space-y-6 text-center">
      {competitorBlocksSize && (
        <div className="result-hero space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            Choose another smaller finger
          </h2>
          <p className="mx-auto max-w-sm text-base leading-relaxed text-[var(--ink)]">
            US {measures.competitorUs} is above the sizes we stock. {tightBody}
          </p>
        </div>
      )}
      {!competitorBlocksSize && verdict.status === "size" && guidance && tryAnotherFinger && (
        <div className="result-hero space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            {verdict.fit === "loose" || verdict.fit === "very_loose" ? "This ring may feel loose" : "This ring will feel tight"}
          </h2>
          <p className="mx-auto max-w-sm text-base leading-relaxed text-[var(--ink)]">
            {tightBody}
          </p>
        </div>
      )}
      {!competitorBlocksSize && verdict.status === "size" && guidance && !tryAnotherFinger && (
        <div className="result-hero space-y-4">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            {sure ? "Your readings agree" : "Your recommended size"}
          </h2>
          <p className="mono-label text-[var(--gold-deep)]">US</p>
          <p className="font-[family-name:var(--font-display)] text-7xl leading-none text-[var(--ink)] sm:text-8xl">
            {verdict.us}
          </p>
          <p className="mx-auto max-w-sm text-base leading-relaxed text-[var(--ink)]">
            {sure
              ? `Every reading lands on US ${verdict.us}.`
              : okCount > readingCount / 2 && okCount < readingCount
                ? `${okCount} of ${readingCount} readings are OK for US ${verdict.us}.`
                : guidance.canConfirm
                  ? guidance.note
                  : guidance.sentence}
          </p>
        </div>
      )}
      {!competitorBlocksSize && verdict.status === "remeasure" && tryAnotherFinger && (
        <>
          <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            This ring will feel tight
          </h2>
          <p className="mx-auto max-w-sm text-base leading-relaxed text-[var(--ink)]">
            {tightBody}
          </p>
        </>
      )}
      {!competitorBlocksSize && verdict.status === "remeasure" && !tryAnotherFinger && experiences.length === 0 && (
        <>
          <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            Add a measurement
          </h2>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-[var(--muted)]">
            Add at least two readings for this finger to see your size.
          </p>
        </>
      )}
      {!competitorBlocksSize && verdict.status === "remeasure" && !tryAnotherFinger && experiences.length > 0 && (
        <>
          <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            {readingCount < 2 ? "Add another measurement" : "Measure again"}
          </h2>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-[var(--muted)]">
            {readingCount < 2
              ? "We need at least two readings for this finger. Add another method before confirming a size."
              : "These readings are tied or disagree. Measure this same finger again using at least two methods."}
          </p>
        </>
      )}
      {!competitorBlocksSize && verdict.status === "unavailable" && (
        <>
          <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
            Size unavailable
          </h2>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-[var(--muted)]">
            Below our smallest size. Available: US 6, 8, 10, 12. {tightBody}
          </p>
        </>
      )}

      {competitorBlocksSize ? (
        <button type="button" onClick={onNextFinger} className={primaryBtn}>
          {tightAction}
        </button>
      ) : guidance?.canConfirm ? (
        <button type="button" onClick={onConfirm} className={primaryBtn}>
          Confirm my size
        </button>
      ) : (
        <button type="button" onClick={tryAnotherFinger || verdict.status === "unavailable" ? onNextFinger : onRestart} className={primaryBtn}>
          {tryAnotherFinger || verdict.status === "unavailable" ? tightAction : "Measure again"}
        </button>
      )}

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-[var(--muted)] underline-offset-4 hover:underline"
      >
        Adjust measurements
      </button>

      <div className="grid grid-cols-2 gap-2 text-left sm:gap-3">
        {experiences.map((exp) => {
          const cls = byKey.get(exp.key);
          return (
            <div
              key={exp.key}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-4 text-center"
            >
              <p className="mono-label text-[var(--muted)]">{exp.label}</p>
              {exp.key === "competitor" && measures.competitorTooLarge ? (
                <>
                  <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">US {measures.competitorUs}</p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--ink)]">Choose another smaller finger</p>
                </>
              ) : exp.key === "competitor" && cls ? (
                <>
                  <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">US {cls.us}</p>
                  {measures.competitorUs != null && measures.competitorUs !== cls.us ? (
                    <p className="mono mt-1 text-[11px] text-[var(--muted)]">From US {measures.competitorUs}</p>
                  ) : null}
                  <p className="mt-2 flex items-center justify-center gap-1.5">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${ZONE_STYLE.green.chip}`} aria-hidden />
                    <span className="mono text-[10px] text-[var(--muted)]">Ok</span>
                  </p>
                </>
              ) : cls ? (
                <>
                  <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">US {cls.us}</p>
                  <p className="mono mt-1 text-[11px] text-[var(--muted)]">{formatReading(exp.value ?? cls.circMm)} mm</p>
                  <p className="mt-2 flex items-center justify-center gap-1.5">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${ZONE_STYLE[cls.color].chip}`} aria-hidden />
                    <span className="mono text-[10px] text-[var(--muted)]">{ZONE_STYLE[cls.color].label}</span>
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">{formatReading(exp.value ?? 0)} mm</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmFit({
  us,
  onRestart,
}: {
  us: number;
  onRestart: () => void;
}) {
  return (
    <div className="space-y-6 text-center">
      <div className="result-icon"><UiIcon name="check" className="h-6 w-6" /></div>
      <h2 className="step-heading">Your fit, confirmed.</h2>
      <p className="mono-label text-[var(--gold-deep)]">US</p>
      <p className="font-[family-name:var(--font-display)] text-7xl leading-none text-[var(--ink)] sm:text-8xl">
        {us}
      </p>
      <button type="button" onClick={onRestart} className={primaryBtn}>
        Measure again
      </button>
    </div>
  );
}
