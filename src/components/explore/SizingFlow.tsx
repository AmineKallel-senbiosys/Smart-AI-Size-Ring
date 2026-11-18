"use client";

import { useEffect, useState } from "react";
import { CalibrateStep } from "@/components/sizer/CalibrateStep";
import { FingerRuler } from "@/components/sizer/FingerRuler";
import { RingMeasure } from "@/components/sizer/RingMeasure";
import { loadCalibration, type StoredCalibration } from "@/lib/calibration";
import { diameterToCircumference } from "@/lib/convert";
import {
  COMPETITOR_US_SIZES,
  fitBandFor,
  stockedFromCompetitorUs,
  validFingerPlan,
  type AvailableUsSize,
  type FingerPick,
  type WearFinger,
  type WearHand,
} from "@/lib/explore-flow";
import { fingerPhrase, nextFingerAdvice, pickLabel } from "@/components/explore/FingerPlanStep";
import { decideReadings, readingFromCirc, type FlowReading, type MethodId } from "@/components/explore/sizing-decision";

type Screen = "start" | "hub" | "known" | "kitSizer" | "cal" | "ring" | "strip" | "result" | "kit";
type Notice =
  | { kind: "reading"; reading: FlowReading; count: number }
  | { kind: "remeasure"; why: "sizes" | "mixed" }
  | { kind: "next"; why: "loose" | "another"; from: FingerPick };

const FINGER_BUTTONS: { id: WearFinger; label: string }[] = [
  { id: "thumb", label: "Thumb" },
  { id: "index", label: "Index" },
  { id: "middle", label: "Middle" },
  { id: "ring", label: "Ring" },
  { id: "pinky", label: "Little" },
];

const METHODS: { id: MethodId; num: string; title: string; sub: string; label: string }[] = [
  { id: "known", num: "1", title: "I know my ring size", sub: "From a jeweler, in millimetres. The fastest and most reliable option.", label: "Jeweler size" },
  { id: "kit", num: "2", title: "Another brand's sizing kit", sub: "Tell us the US size that felt comfortable.", label: "Other brand" },
  { id: "ring", num: "3", title: "A ring that fits me", sub: "Lay it on your screen and match its inside edge.", label: "Ring on screen" },
  { id: "strip", num: "4", title: "A strip of paper", sub: "Wrap it around your finger, mark it, measure it on screen.", label: "Paper strip" },
];

const CHIP: Record<FlowReading["color"], { label: string; className: string }> = {
  green: { label: "Ok", className: "tag" },
  red: { label: "Loose", className: "tag warn" },
  black: { label: "Tight", className: "tag ink" },
};

export function SizingFlow() {
  const [screen, setScreen] = useState<Screen>("start");
  const [viewHand, setViewHand] = useState<WearHand>("right");
  const [picks, setPicks] = useState<FingerPick[]>([]);
  const [idx, setIdx] = useState(0);
  const [readings, setReadings] = useState<FlowReading[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [result, setResult] = useState<{ us: AvailableUsSize; okCount: number } | null>(null);
  const [skipped, setSkipped] = useState<Partial<Record<string, "loose" | "another">>>({});
  const [kitReason, setKitReason] = useState<"choice" | "nofinger" | "nomethods">("choice");
  const [kitFrom, setKitFrom] = useState<Screen>("hub");
  const [pending, setPending] = useState<MethodId | null>(null);
  const [calibration, setCalibration] = useState<StoredCalibration | null>(null);
  const [knownMm, setKnownMm] = useState(57);
  const [kitUs, setKitUs] = useState<number | null>(null);
  const [diameterMm, setDiameterMm] = useState(18.14);
  const [stripMm, setStripMm] = useState(57);
  const [added, setAdded] = useState(false);
  const [kitOrdered, setKitOrdered] = useState(false);
  const [activeSensor, setActiveSensor] = useState(0);
  const [stripGuide, setStripGuide] = useState(false);

  useEffect(() => {
    setCalibration(loadCalibration());
  }, []);

  useEffect(() => {
    if (!stripGuide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStripGuide(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stripGuide]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSensor((current) => (current + 7) % 18);
    }, 1100);
    return () => window.clearInterval(timer);
  }, []);

  const current = picks[idx];
  const fingerLabel = current ? fingerPhrase(current.hand, current.finger) : "finger";
  const nextAdvice = nextFingerAdvice(picks, idx);
  const hubDecision = decideReadings(readings);
  const inFlow = screen !== "start";
  const pickKey = (pick: FingerPick) => `${pick.hand}:${pick.finger}`;

  const resetFinger = (fingerIndex: number) => {
    setIdx(fingerIndex);
    setReadings([]);
    setNotice(null);
    setResult(null);
    setPending(null);
    setKnownMm(57);
    setKitUs(null);
    setDiameterMm(18.14);
    setStripMm(57);
    setAdded(false);
    setScreen("hub");
  };

  const openMethod = (id: MethodId) => {
    if (readings.some((reading) => reading.id === id)) return;
    if (id === "strip") {
      setStripGuide(true);
      return;
    }
    if (id === "ring") {
      setPending(id);
      setScreen("cal");
      return;
    }
    setScreen(id === "known" ? "known" : id === "kit" ? "kitSizer" : id);
  };

  const settle = (list: FlowReading[]) => {
    const decision = decideReadings(list);
    if (decision.d === "recommend") {
      setReadings(list);
      setResult({ us: decision.us, okCount: decision.okCount });
      setNotice(null);
      setAdded(false);
      setScreen("result");
      return;
    }
    if (decision.d === "next") {
      const from = picks[idx];
      if (from) setSkipped((currentSkips) => ({ ...currentSkips, [pickKey(from)]: decision.why }));
      if (from && idx + 1 < picks.length) {
        resetFinger(idx + 1);
        setNotice({ kind: "next", why: decision.why, from });
      } else {
        setReadings([]);
        setNotice(null);
        setResult(null);
        setPicks([]);
        setIdx(0);
        setSkipped({});
        setScreen("start");
      }
      return;
    }
    if (decision.d === "more") return;
    setReadings(list);
    setNotice({ kind: "remeasure", why: decision.why });
    setScreen("hub");
  };

  const commit = (reading: FlowReading) => {
    const list = [...readings.filter((item) => item.id !== reading.id), reading];
    setReadings(list);
    setNotice(list.length === 1 ? { kind: "reading", reading, count: 1 } : null);
    setResult(null);
    setScreen("hub");
  };

  const goBack = () => {
    if (screen === "kit") setScreen(kitFrom === "start" ? "start" : kitFrom);
    else if (screen === "hub") setScreen("start");
    else setScreen("hub");
  };

  const togglePick = (pick: FingerPick) => {
    setPicks((currentPicks) => {
      const place = currentPicks.findIndex((item) => item.hand === pick.hand && item.finger === pick.finger);
      if (place >= 0) return currentPicks.filter((_, itemIndex) => itemIndex !== place);
      if (currentPicks.length >= 3) return currentPicks;
      return [...currentPicks, pick];
    });
  };

  const targetDots = METHODS.length;
  const ready = validFingerPlan(picks);

  return (
    <>
    <div className="explore-page">
      <section className="explore-card flex min-w-0 flex-col gap-4 rounded-[32px] bg-white p-6 sm:p-8">
        {screen !== "start" && screen !== "cal" && screen !== "ring" && screen !== "strip" && (
          <button type="button" onClick={goBack} className="btn-secondary h-10 self-start px-3 text-sm">
            ‹ Back
          </button>
        )}

        {screen === "start" && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-[clamp(26px,3vh,32px)] leading-tight text-[var(--ink)]">Where would you wear it?</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">Tap your fingers in order of preference. We start with your first choice and only move on if needed.</p>
            </div>
            <div className="seg max-w-[360px]" role="group" aria-label="Choose a hand">
              {(["left", "right"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  aria-pressed={viewHand === side}
                  onClick={() => setViewHand(side)}
                  className={viewHand === side ? "on" : undefined}
                >
                  {side === "left" ? "Left hand" : "Right hand"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {FINGER_BUTTONS.map((finger) => {
                const place = picks.findIndex((pick) => pick.hand === viewHand && pick.finger === finger.id);
                const on = place >= 0;
                return (
                  <button
                    key={finger.id}
                    type="button"
                    aria-pressed={on}
                    aria-label={on ? `${viewHand} ${finger.label}, choice ${place + 1}` : `${viewHand} ${finger.label}`}
                    disabled={!on && picks.length >= 3}
                    onClick={() => togglePick({ hand: viewHand, finger: finger.id })}
                    className={`pick-card flex h-[108px] flex-col items-center justify-center gap-2 px-1 ${on ? "on" : ""} disabled:cursor-default disabled:opacity-60`}
                  >
                    <span aria-hidden className={`flex h-[34px] w-[34px] items-center justify-center rounded-full border text-[15px] font-bold ${on ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--border)] text-transparent"}`}>
                      {on ? place + 1 : ""}
                    </span>
                    <span className="text-sm font-semibold text-[var(--ink)] sm:text-base">{finger.label}</span>
                    <span className="h-3.5 text-xs text-[var(--muted)]">{place === 0 ? "First choice" : on ? "Backup" : ""}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-sm leading-relaxed text-[var(--muted)]" aria-live="polite">
              {ready
                ? `If your ${fingerPhrase(picks[0].hand, picks[0].finger)} feels tight, we’ll ask you to measure your ${fingerPhrase(picks[1].hand, picks[1].finger)}.`
                : "Switch hands to choose the other one. A choice stays on the hand you tapped."}
            </p>
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                setIdx(0);
                setReadings([]);
                setNotice(null);
                setSkipped({});
                setResult(null);
                setScreen("hub");
              }}
              className="btn-primary self-start px-7"
            >
              {ready ? `Start with my ${fingerPhrase(picks[0].hand, picks[0].finger)}` : "Pick three fingers"}
            </button>
          </div>
        )}

        {screen === "hub" && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-[clamp(26px,3vh,32px)] leading-tight text-[var(--ink)]">Measure your {fingerLabel}</h2>
              <p className="mt-2 text-base leading-relaxed text-[var(--muted)]">Each method shows its own result. Finish after two, or keep measuring through all four.</p>
            </div>
            <div className="flex max-w-[360px] gap-1" aria-hidden>
              {Array.from({ length: targetDots }, (_, dot) => (
                <span key={dot} className={`h-px flex-1 rounded-full ${dot < readings.length ? "bg-[var(--ink)]" : "bg-black/15"}`} />
              ))}
            </div>
            {notice && <HubNotice notice={notice} advice={notice.kind === "next" ? nextFingerAdvice(picks, idx - 1) : null} />}
            {readings.length >= 2 && (
              <div className="msg blue" role="status">
                <p className="font-semibold">
                  {readings.filter((reading) => reading.color === "green").length} OK · {readings.filter((reading) => reading.color === "red").length} Loose · {readings.filter((reading) => reading.color === "black").length} Tight
                </p>
                <p>
                  {hubDecision.d === "recommend"
                    ? `Your recommended size is US ${hubDecision.us}. Finish sizing now${readings.length < METHODS.length ? ", or measure with another method" : ""}.`
                    : hubDecision.d === "next"
                      ? `This ring may feel ${hubDecision.why === "loose" ? "loose" : "tight"}. ${nextAdvice ? nextAdvice.body : "All three selected fingers have been tried. Choose three new fingers to continue."}`
                      : hubDecision.d === "remeasure" && hubDecision.why === "sizes"
                        ? `These readings indicate different US sizes. Remeasure your ${fingerLabel}.`
                        : `These readings are tied or disagree. Remeasure your ${fingerLabel}.`}
                </p>
              </div>
            )}
            <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-2 sm:grid-rows-2">
              {METHODS.map((method) => {
                const saved = readings.find((reading) => reading.id === method.id);
                const chip = saved ? CHIP[saved.color] : null;
                return (
                  <button
                    key={method.id}
                    type="button"
                    disabled={Boolean(saved)}
                    onClick={() => openMethod(method.id)}
                    className={`flex h-full min-h-0 flex-col justify-center gap-1 rounded-[28px] bg-[var(--surface-2)] px-6 py-4 text-left ${saved ? "" : "hover:bg-[#ebebeb]"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--muted)]">{method.num}</span>
                      {method.id === "known" && !saved && (
                        <span className="tag">Most accurate</span>
                      )}
                      {saved && chip && (
                        <span className="flex items-center gap-2 text-sm">
                          <span className="font-semibold text-[var(--ink)]">{saved.tooLarge ? `US ${saved.enteredUs}` : saved.us ? `US ${saved.us}` : ""}</span>
                          <span className={chip.className}>{chip.label}</span>
                        </span>
                      )}
                    </span>
                    <span className="text-[17px] font-medium text-[var(--ink)]">{method.title}</span>
                    <span className="text-sm leading-relaxed text-[var(--muted)]">{method.sub}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3">
              {hubDecision.d === "recommend" && (
                <button type="button" onClick={() => settle(readings)} className="btn-primary px-7">Finish sizing</button>
              )}
              {hubDecision.d === "remeasure" && (
                <button type="button" onClick={() => resetFinger(idx)} className="btn-primary px-7">Remeasure this finger</button>
              )}
              {hubDecision.d === "next" && (
                <button type="button" onClick={() => settle(readings)} className="btn-primary px-7">
                  {nextAdvice?.action ?? "Choose three new fingers"}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setKitReason("choice");
                  setKitFrom("hub");
                  setScreen("kit");
                }}
                className="self-start rounded-[20px] border border-dashed border-[var(--disabled)] bg-transparent px-5 py-3 text-sm font-medium text-[var(--muted)]"
              >
                Can’t measure? Get a sizing kit
              </button>
            </div>
          </div>
        )}

        {screen === "known" && (
          <div className="flex max-w-xl flex-col gap-6">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-[30px] leading-tight text-[var(--ink)]">What size did the jeweler give you?</h2>
              <p className="mt-2 text-base leading-relaxed text-[var(--muted)]">For your {fingerLabel}. Use the circumference in millimetres.</p>
            </div>
            <div className="flex items-center gap-6">
              <button type="button" aria-label="Smaller" onClick={() => setKnownMm((value) => Math.max(40, +(value - 0.1).toFixed(1)))} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-2xl hover:bg-[#ebebeb]">−</button>
              <div className="min-w-[120px] text-center">
                <p className="mono-label text-[var(--muted)]">Millimetres</p>
                <p className="font-[family-name:var(--font-display)] text-6xl leading-none text-[var(--ink)]">{knownMm.toFixed(1)}</p>
              </div>
              <button type="button" aria-label="Larger" onClick={() => setKnownMm((value) => Math.min(80, +(value + 0.1).toFixed(1)))} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-2)] text-2xl hover:bg-[#ebebeb]">+</button>
            </div>
            <button type="button" onClick={() => commit(readingFromCirc("known", knownMm))} className="btn-primary self-start px-7">Use this size</button>
          </div>
        )}

        {screen === "kitSizer" && (
          <div className="flex max-w-2xl flex-col gap-6">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-[30px] leading-tight text-[var(--ink)]">Which sizer felt comfortable?</h2>
              <p className="mt-2 text-base leading-relaxed text-[var(--muted)]">Using another brand’s sizing kit on your {fingerLabel}? Pick the US size you’d happily wear all day.</p>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {COMPETITOR_US_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={kitUs === size}
                  onClick={() => setKitUs(size)}
                  className={`gchip ${kitUs === size ? "on" : ""}`}
                >
                  {size}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={kitUs == null}
              onClick={() => {
                if (kitUs == null) return;
                const stocked = stockedFromCompetitorUs(kitUs);
                if (!stocked) return;
                if (stocked === "smaller-finger") {
                  commit({ id: "kit", circMm: null, us: null, color: "black", tooLarge: true, enteredUs: kitUs });
                  return;
                }
                commit({ ...readingFromCirc("kit", fitBandFor(stocked).referenceMm), enteredUs: kitUs });
              }}
              className="btn-primary self-start px-7"
            >
              {kitUs == null ? "Pick a size" : `Use US ${kitUs}`}
            </button>
          </div>
        )}

        {screen === "cal" && (
          <CalibrateStep
            initial={calibration}
            onSaved={setCalibration}
            onBack={() => setScreen("hub")}
            onContinue={() => setScreen(pending === "strip" ? "strip" : pending === "ring" ? "ring" : "hub")}
          />
        )}

        {screen === "ring" && calibration && (
          <RingMeasure
            calibration={calibration}
            diameterMm={diameterMm}
            onDiameterChange={setDiameterMm}
            onBack={() => setScreen("hub")}
            onRecalibrate={() => {
              setPending("ring");
              setScreen("cal");
            }}
            onSwitchFinger={() => {}}
            onResult={() => commit(readingFromCirc("ring", diameterToCircumference(diameterMm)))}
            guided
            nextLabel="Use this ring"
          />
        )}

        {screen === "strip" && calibration && (
          <FingerRuler
            calibration={calibration}
            circumferenceMm={stripMm}
            onCircumferenceChange={setStripMm}
            onBack={() => setScreen("hub")}
            onRecalibrate={() => {
              setPending("strip");
              setScreen("cal");
            }}
            onSwitchRing={() => {}}
            onResult={() => commit(readingFromCirc("strip", stripMm))}
            guided
            nextLabel="Use this measurement"
          />
        )}

        {screen === "result" && result && (
          <div className="flex flex-wrap items-start gap-7">
            <div className="flex min-w-[240px] flex-1 flex-col items-center gap-2 rounded-[28px] bg-[var(--blue-bg)] px-5 py-8 text-center">
              <p className="text-sm font-medium text-[var(--blue)]">Your final size · {fingerLabel}</p>
              <p className="text-7xl font-medium leading-none tracking-[-0.04em] text-[var(--ink)]">US {result.us}</p>
              <p className="tag mt-2">Confirmed by {result.okCount} of {readings.length} measurements</p>
            </div>
            <div className="flex min-w-[260px] flex-1 flex-col gap-3.5">
              <p className="font-medium text-[var(--ink)]">Based on</p>
              {readings.map((reading) => {
                const method = METHODS.find((item) => item.id === reading.id);
                const chip = CHIP[reading.color];
                return (
                  <div key={reading.id} className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] px-3.5 py-3 text-sm">
                    <span>{method?.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{reading.tooLarge ? `US ${reading.enteredUs}` : reading.us ? `US ${reading.us}` : ""}</span>
                      <span className={chip.className}>{chip.label}</span>
                    </span>
                  </div>
                );
              })}
              <div className="space-y-2 text-sm leading-relaxed text-[var(--ink)]">
                <p><strong>Feels a bit tight?</strong> {nextAdvice ? nextAdvice.body : "Your first exchange is free, and we ship the new size as soon as you ask."}</p>
                {nextAdvice && <p><strong>Still not right?</strong> Your first exchange is free, and we ship the new size as soon as you ask.</p>}
              </div>
              <div className="flex flex-wrap gap-3">
                {nextAdvice && (
                  <button
                    type="button"
                    onClick={() => {
                      resetFinger(idx + 1);
                    }}
                    className="btn-primary px-6"
                  >
                    {nextAdvice.action}
                  </button>
                )}
                <button type="button" onClick={() => setAdded(true)} className="btn-primary px-6">{added ? "✓ Added to cart" : `Add ring · US ${result.us} to cart`}</button>
                <button type="button" onClick={() => { setScreen("start"); setReadings([]); setIdx(0); setNotice(null); setResult(null); setSkipped({}); }} className="btn-secondary px-4">Start over</button>
              </div>
            </div>
          </div>
        )}

        {screen === "kit" && (
          <KitOffer
            reason={kitReason}
            ordered={kitOrdered}
            backLabel={kitFrom === "start" ? "Back" : "Back to measuring"}
            onOrder={() => setKitOrdered(true)}
            onBack={() => setScreen(kitFrom === "start" ? "start" : "hub")}
          />
        )}
      </section>

      <aside className="explore-aside flex w-full flex-col gap-2">
        <div className="flex shrink-0 flex-col gap-1.5 rounded-[28px] bg-[var(--surface-2)] p-4">
          <div className="flex items-center gap-4">
            <Constellation active={activeSensor} />
            <div>
              <p className="text-sm font-medium text-[var(--muted)]">360° sensor constellation</p>
              <p className="mt-0.5 text-sm font-medium leading-tight text-[var(--ink)]">Choose comfort. Our sensors adapt to you.</p>
            </div>
          </div>
          <p className="line-clamp-2 text-xs leading-snug text-[var(--ink)]">18 sensors surround your finger. Before every reading, the ring picks the one with the best contact, so it stays accurate even if the ring turns or sits a little loose.</p>
          <ol className="flex flex-col gap-1.5">
            {[
              ["Scan.", "Before each reading, the ring checks all 18 sensors."],
              ["Select.", "It keeps the one with the best contact at that moment."],
              ["Measure.", "Your size is read from it, wherever the ring has turned."],
            ].map(([title, body], step) => (
              <li key={title} className="flex items-start gap-2 text-xs leading-snug">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[11px] font-semibold text-white">{step + 1}</span>
                <span><strong>{title}</strong> {body}</span>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              ["✓", "Snug", false],
              ["✓", "Comfy", false],
              ["✓", "A bit loose", false],
              ["✗", "Slips off", true],
            ].map(([mark, label, bad]) => (
              <div key={String(label)} className={`flex flex-col items-center gap-0.5 rounded-[16px] px-1 py-2 text-center text-xs font-medium ${bad ? "bg-[var(--rose-bg)] text-[var(--rose-ink)]" : "bg-white text-[var(--ink)]"}`}>
                <span className="text-[15px]">{mark}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {picks.length > 0 && (
          <div className="flex shrink-0 flex-col gap-1.5 rounded-[18px] border border-[var(--border)] bg-white p-2.5">
            <p className="font-medium text-[var(--ink)]">Your fingers</p>
            {picks.map((pick, place) => {
              const measuring = inFlow && place === idx;
              const skip = skipped[pickKey(pick)];
              const status = skip
                ? skip === "loose" ? "Loose fit, skipped" : "Tight fit, skipped"
                : measuring
                  ? screen === "result" && result ? `US ${result.us}` : "Measuring now"
                  : place === 0 ? "First choice" : "Backup";
              return (
                <div key={pickKey(pick)} className={`flex items-center gap-2 rounded-[20px] px-2.5 py-1.5 text-sm ${measuring ? "bg-[var(--blue-bg)]" : "bg-[var(--surface-2)]"}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white ${measuring ? "bg-[var(--ink)]" : "bg-[var(--disabled)]"}`}>{place + 1}</span>
                  <span className="flex-1 font-medium">{pickLabel(pick)}</span>
                  <span className="text-xs text-[var(--muted)]">{status}</span>
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </div>
    {stripGuide && (
      <StripGuide
        fingerLabel={fingerLabel}
        onClose={() => setStripGuide(false)}
        onReady={() => {
          setStripGuide(false);
          setPending("strip");
          setScreen("cal");
        }}
      />
    )}
    </>
  );
}

const STRIP_STEPS = [
  ["Cut a strip", "Use a thin piece of paper, about the width of the strip in the photo."],
  ["Wrap your finger", "Snug is right. Not tight, and not loose."],
  ["Mark the overlap", "Put a pen mark where the paper meets, as in the photo."],
  ["Measure that mark", "Lay the strip flat and match its length on the next screen."],
];

function StripGuide({
  fingerLabel,
  onClose,
  onReady,
}: {
  fingerLabel: string;
  onClose: () => void;
  onReady: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-white/50 p-3 backdrop-blur-[24px] sm:items-center sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="strip-guide-title"
        className="flex max-h-[min(760px,92dvh)] w-full max-w-[520px] flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.14)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 id="strip-guide-title" className="text-[28px] leading-none tracking-[-0.03em] text-[var(--ink)]">How to use a paper strip</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">Wrap a thin strip around your {fingerLabel}, mark where it overlaps, then measure that length on screen.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-lg text-[var(--ink)] hover:bg-[#ebebeb]">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 pb-2 pt-4">
          <img
            src="/paper-strip-method.png"
            alt="A paper strip wrapped around a finger, with a pen mark where the paper overlaps."
            className="max-h-[280px] w-full rounded-[24px] bg-[var(--surface-2)] object-contain"
          />
          <ol className="mt-4 flex flex-col gap-2">
            {STRIP_STEPS.map(([title, text], index) => (
              <li key={title} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-xs font-medium text-white">{index + 1}</span>
                <p className="text-sm leading-relaxed text-[var(--ink)]"><strong>{title}.</strong> <span className="text-[var(--muted)]">{text}</span></p>
              </li>
            ))}
          </ol>
        </div>
        <div className="px-6 py-5">
          <button type="button" onClick={onReady} className="btn-primary w-full">Measure my strip</button>
        </div>
      </div>
    </div>
  );
}

function HubNotice({ notice, advice }: { notice: Notice; advice: { body: string; action: string } | null }) {
  if (notice.kind === "reading") {
    const chip = CHIP[notice.reading.color];
    const size = notice.reading.tooLarge
      ? `US ${notice.reading.enteredUs}`
      : notice.reading.us
        ? `US ${notice.reading.us}`
        : "No stocked size";
    return (
      <p className="msg blue">
        <strong>Result: {size} · {chip.label}.</strong>{" "}
        {notice.count >= 2 ? "Finish sizing now, or measure with another method." : "Measure with one more method before you can finish."}
      </p>
    );
  }
  if (notice.kind === "next") {
    const from = fingerPhrase(notice.from.hand, notice.from.finger);
    return (
      <p className="msg blue">
        <strong>{advice?.body ?? `Measure your ${from} next.`}</strong>{" "}
        {notice.why === "loose"
          ? `The readings for your ${from} suggest a loose fit, so the ring could slip off.`
          : `Your ${from} feels tight.`}
      </p>
    );
  }
  return (
    <p className="msg amber">
      <strong>{notice.why === "sizes" ? "Your measurements point to different sizes." : "Your measurements don't agree yet."}</strong>{" "}
      Add one more with a method you haven’t used, and take your time.
    </p>
  );
}

function KitOffer({
  reason,
  ordered,
  backLabel,
  onOrder,
  onBack,
}: {
  reason: "choice" | "nofinger" | "nomethods";
  ordered: boolean;
  backLabel: string;
  onOrder: () => void;
  onBack: () => void;
}) {
  const reasonText = reason === "nofinger"
    ? "None of the fingers you picked matched our sizes. The sizing kit lets you try them on for real."
    : reason === "nomethods"
      ? "We couldn't confirm one size from your measurements. Trying sizers on is the surest way."
      : null;
  const benefits = [
    ["Your $20 comes back", "You get a personal code that takes the full $20 off your ring. It’s valid for a limited time, so you won’t forget."],
    ["Made to be passed on, not thrown away", "One kit can size many fingers. When you’re done, keep it out of the bin: give it to a friend who’s curious about the ring."],
    ["Earn credit when your friend orders", "Your kit carries your referral code. If a friend orders with it, you earn credit, even if you haven’t bought one yourself."],
  ];
  return (
    <div className="flex flex-col gap-6">
      {reasonText && <p className="msg amber">{reasonText}</p>}
      <div className="flex flex-wrap items-end gap-6">
        <div className="min-w-[280px] flex-1">
          <h2 className="font-[family-name:var(--font-display)] text-[30px] leading-tight text-[var(--ink)]">Try sizes at home with the sizing kit</h2>
          <p className="mt-2 text-base leading-relaxed text-[var(--muted)]">Wear each sizer for a few minutes, pick the one that feels comfortable, then order your ring.</p>
        </div>
        <div className="flex items-baseline gap-2.5 rounded-[28px] bg-[var(--surface-2)] px-5 py-4">
          <span className="font-[family-name:var(--font-display)] text-4xl text-[var(--ink)]">$20</span>
          <span className="max-w-[160px] text-sm leading-snug text-[var(--ink)]">fully deducted from your ring when you order</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {benefits.map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-[var(--border)] p-5">
            <p className="font-medium text-[var(--ink)]">{title}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink)]">{body}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onOrder} className="btn-primary px-7">{ordered ? "✓ Sizing kit added" : "Get the sizing kit · $20"}</button>
        <button type="button" onClick={onBack} className="btn-secondary px-5">{backLabel}</button>
      </div>
    </div>
  );
}

function Constellation({ active }: { active: number }) {
  return (
    <div className="relative h-[72px] w-[72px] shrink-0" aria-hidden>
      <span className="absolute left-1.5 top-1.5 h-[60px] w-[60px] rounded-full border-[5px] border-white" />
      <span className="absolute left-[22px] top-[22px] h-7 w-7 rounded-full bg-white" />
      {Array.from({ length: 18 }, (_, index) => {
        const angle = (index / 18) * Math.PI * 2 - Math.PI / 2;
        const on = index === active;
        const size = on ? 10 : 5;
        const x = 36 + 30 * Math.cos(angle) - size / 2;
        const y = 36 + 30 * Math.sin(angle) - size / 2;
        return (
          <span
            key={index}
            className="absolute rounded-full transition-all duration-300"
            style={{
              left: x,
              top: y,
              width: size,
              height: size,
              background: on ? "var(--ink)" : "var(--blue)",
              boxShadow: on ? "0 0 0 5px rgba(33,113,255,0.16)" : "none",
            }}
          />
        );
      })}
    </div>
  );
}
