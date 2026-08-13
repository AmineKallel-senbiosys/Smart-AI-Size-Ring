"use client";

import { AnimatePresence } from "framer-motion";
import Link from "next/link";
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

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_60px_-32px_rgba(16,21,26,0.28)] sm:p-8">
      <div className="mb-5 border-b border-[var(--border)] pb-4">
        <WizardProgress
          stepIndex={stepIndex[step]}
          onStepClick={(i) => {
            if (i === 0) setStep("start");
            else if (i === 1) setStep("calibrate");
            else if (i === 2) goMeasure();
          }}
        />
      </div>

      <AnimatePresence mode="wait">
        {step === "start" && (
          <StepFade stepKey="start">
            <div className="space-y-5 text-center">
              <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold">
                Screen ring sizer
              </h2>
              <p className="mx-auto max-w-sm text-sm text-[var(--muted)]">
                Calibrate with a card or coin, then match a ring you own — or
                measure a paper strip around your finger.
              </p>
              <button
                type="button"
                disabled={!hydrated}
                onClick={() => setStep("calibrate")}
                className="accent-fill w-full rounded-lg px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Start measuring ›
              </button>
              {calibration && (
                <button
                  type="button"
                  onClick={() => goMeasure()}
                  className="mono-label text-[var(--accent-deep)] underline underline-offset-4"
                >
                  Skip — already calibrated
                </button>
              )}
              <Link
                href="/scan"
                className="block text-sm text-[var(--muted)] underline-offset-4 hover:underline"
              >
                Or use the camera scan →
              </Link>
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
