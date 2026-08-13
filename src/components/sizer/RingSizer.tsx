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
import { RingMark } from "@/components/RingMark";
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
      className="scroll-mt-24 rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-9 shadow-[0_28px_70px_-32px_rgba(23,18,13,0.35)] sm:p-12"
    >
      <div className="mb-8 border-b border-[var(--border)] pb-6">
        <WizardProgress stepIndex={stepIndex[step]} onStepClick={jumpTo} />
      </div>

      <AnimatePresence mode="wait">
        {step === "start" && (
          <StepFade stepKey="start">
            <div className="space-y-8 text-center">
              <div className="flex justify-center">
                <RingMark size={81} />
              </div>
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-[33px] leading-tight text-[var(--ink)]">
                  Ready when you are
                </h2>
                <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-[var(--muted)]">
                  Calibrate once with a card or coin, then match a ring you own —
                  or measure your finger with a paper strip.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { t: "¼ sizes", d: "Fine increments" },
                  { t: "4 regions", d: "US · UK · EU · JP" },
                  { t: "100%", d: "On-device" },
                ].map((item) => (
                  <div
                    key={item.t}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-5"
                  >
                    <p className="font-[family-name:var(--font-display)] text-[22px] text-[var(--ink)]">
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
                Start measuring ›
              </button>

              {calibration && (
                <button
                  type="button"
                  onClick={() => goMeasure()}
                  className="mono-label text-[var(--gold-deep)] underline underline-offset-4"
                >
                  Skip — screen already calibrated
                </button>
              )}

              <Link
                href="/scan"
                className="block text-sm text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
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
