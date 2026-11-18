"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import {
  circumferenceToDiameter,
  diameterToCircumference,
} from "@/lib/convert";
import {
  loadCalibration,
  loadLastResult,
  saveLastResult,
  type StoredCalibration,
} from "@/lib/calibration";
import { UiIcon } from "@/components/UiIcon";
import { CalibrateStep } from "./CalibrateStep";
import { FingerRuler } from "./FingerRuler";
import { ResultPanel } from "./ResultPanel";
import { RingMeasure } from "./RingMeasure";
import { StepFade, WizardProgress } from "./WizardShell";

type Step = "start" | "calibrate" | "measure-ring" | "measure-finger" | "result";

const stepIndex: Record<Step, number> = {
  start: 0,
  calibrate: 1,
  "measure-ring": 2,
  "measure-finger": 2,
  result: 3,
};

export function RingSizer() {
  const [step, setStep] = useState<Step>("start");
  const [calibration, setCalibration] = useState<StoredCalibration | null>(null);
  const [mode, setMode] = useState<"ring" | "finger">("ring");
  const [diameterMm, setDiameterMm] = useState(18.14);
  const [circumferenceMm, setCircumferenceMm] = useState(57);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCalibration(loadCalibration());
    const last = loadLastResult();
    if (last) {
      setMode(last.mode);
      setDiameterMm(last.diameterMm);
      setCircumferenceMm(last.circumferenceMm);
    }
    setHydrated(true);
  }, []);

  const goMeasure = (m: "ring" | "finger" = mode) => {
    setMode(m);
    setStep(m === "ring" ? "measure-ring" : "measure-finger");
  };

  const finish = (m: "ring" | "finger") => {
    const d =
      m === "ring" ? diameterMm : circumferenceToDiameter(circumferenceMm);
    const c =
      m === "ring" ? diameterToCircumference(diameterMm) : circumferenceMm;
    setMode(m);
    setDiameterMm(d);
    setCircumferenceMm(c);
    saveLastResult({
      diameterMm: d,
      circumferenceMm: c,
      mode: m,
      method: "screen",
      savedAt: Date.now(),
    });
    setStep("result");
  };

  const jumpTo = (i: number) => {
    if (i === 0) setStep("start");
    else if (i === 1) setStep("calibrate");
    else if (i === 2) goMeasure();
  };

  return (
    <section
      id="sizer"
      className="wizard-card"
    >
      <div>
        <WizardProgress stepIndex={stepIndex[step]} onStepClick={jumpTo} />
      </div>

      <AnimatePresence mode="wait">
        {step === "start" && (
          <StepFade stepKey="start">
            <div className="space-y-8 text-center">
              <div className="intro-icon">
                <UiIcon name="ruler" className="h-9 w-9" />
              </div>
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-[33px] leading-tight text-[var(--ink)]">
                  Measure at your pace
                </h2>
                <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-[var(--muted)]">
                  Match your screen, then measure a ring or paper strip.
                </p>
              </div>

              <div className="kit-list"><span>Card or coin</span><span>Ring or paper strip</span></div>

              <button
                type="button"
                disabled={!hydrated}
                onClick={() => setStep("calibrate")}
                className="btn-primary w-full"
              >
                Start measuring ›
              </button>

              {calibration && (
                <button
                  type="button"
                  onClick={() => goMeasure()}
                  className="mono-label text-[var(--gold-deep)] underline underline-offset-4"
                >
                  Use saved calibration
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
              onBack={() => setStep("start")}
              onContinue={() => goMeasure("ring")}
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
              onSwitchFinger={() => {
                setCircumferenceMm(diameterToCircumference(diameterMm));
                goMeasure("finger");
              }}
              onResult={() => finish("ring")}
            />
          </StepFade>
        )}

        {step === "measure-finger" && calibration && (
          <StepFade stepKey="measure-finger">
            <FingerRuler
              calibration={calibration}
              circumferenceMm={circumferenceMm}
              onCircumferenceChange={setCircumferenceMm}
              onBack={() => setStep("calibrate")}
              onRecalibrate={() => setStep("calibrate")}
              onSwitchRing={() => {
                setDiameterMm(circumferenceToDiameter(circumferenceMm));
                goMeasure("ring");
              }}
              onResult={() => finish("finger")}
            />
          </StepFade>
        )}

        {step === "result" && (
          <StepFade stepKey="result">
            <ResultPanel
              mode={mode}
              valueMm={mode === "ring" ? diameterMm : circumferenceMm}
              onAdjust={() => goMeasure(mode)}
              onRestart={() => setStep("start")}
            />
          </StepFade>
        )}
      </AnimatePresence>
    </section>
  );
}
