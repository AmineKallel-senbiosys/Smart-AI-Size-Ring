"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fingerPhrase, nextFingerAdvice } from "@/components/explore/FingerPlanStep";
import { decideReadings, readingFromCirc, type FlowReading, type MethodId } from "@/components/explore/sizing-decision";
import { Pill, VeliaModalShell } from "@/components/velia/VeliaModalShell";
import { GenderStep } from "@/components/onehand/GenderStep";
import { OneHandPair } from "@/components/onehand/OneHandPair";
import { OneHandSizes } from "@/components/onehand/OneHandSizes";
import { sizeRows, type FingerKey, type Gender, type HandSide, type OneHandSession } from "@/lib/onehand/engine";
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  DEFAULT_CARD_HEIGHT_CSS_PX,
  loadCalibration,
  mmPerPxFromOutline,
  saveCalibration,
  type StoredCalibration,
} from "@/lib/calibration";
import { diameterToCircumference, formatMm } from "@/lib/convert";
import {
  COMPETITOR_US_SIZES,
  fitBandFor,
  stockedFromCompetitorUs,
  type AvailableUsSize,
  type FingerPick,
} from "@/lib/explore-flow";

type Screen = "gender" | "pair" | "sizes" | "hub" | "known" | "kitSizer" | "cal" | "ring" | "strip" | "result" | "kit";
type CameraSize = { finger: FingerKey; hand: HandSide; gender: Gender | null; size: number; display: string; at: number };
type Outcome =
  | { kind: "size"; us: AvailableUsSize; camera?: CameraSize | null }
  | { kind: "kit"; camera?: CameraSize | null };
const CAMERA_STORE_KEY = "velia.sizing.camera";


const METHODS: { id: MethodId; title: string; sub: string; label: string }[] = [
  { id: "known", title: "I know my size", sub: "From a jeweler or a ring sizer", label: "Known size" },
  { id: "kit", title: "Another ring sizing kit", sub: "Another smart ring brand or a sizer set", label: "Sizing kit" },
  { id: "ring", title: "A ring I own", sub: "Match a circle on screen", label: "Ring" },
  { id: "strip", title: "Paper strip", sub: "Wrap, mark, measure on screen", label: "Paper strip" },
];

const PICK_CARDS: { id: MethodId; title: string; sub: string }[] = [
  { id: "known", title: "Convert my ring size", sub: "From a jeweler" },
  { id: "kit", title: "Another ring sizing kit", sub: "Another smart ring brand\nor a sizer set" },
  { id: "ring", title: "Measure a ring I own", sub: "Match a circle on screen" },
  { id: "strip", title: "Measure my finger with paper", sub: "Wrap a strip, mark it,\nmeasure on screen" },
];

const FIT_LABEL: Record<FlowReading["color"], string> = {
  green: "Ok",
  red: "Loose",
  black: "Tight",
};

const FIT_CLASS: Record<FlowReading["color"], string> = {
  green: "tag",
  red: "tag warn",
  black: "tag ink",
};

function readingChip(reading: FlowReading): { label: string; className: string } {
  const size =
    reading.tooLarge && reading.enteredUs != null
      ? `US${reading.enteredUs}`
      : reading.us != null
        ? `US${reading.us}`
        : null;
  const fit = FIT_LABEL[reading.color];
  return {
    label: size ? `${size} ${fit}` : fit,
    className: FIT_CLASS[reading.color],
  };
}

const STRIP_STEPS = [
  ["Cut a strip", "Use a thin piece of paper, about the width of the strip in the photo."],
  ["Wrap your finger", "Snug is right. Not tight, and not loose."],
  ["Mark the overlap", "Put a pen mark where the paper meets, as in the photo."],
  ["Measure that mark", "Lay the strip flat and match its length on the next screen."],
];

const STRIP_MIN_MM = 40;
const STRIP_MAX_MM = 80;
const RING_MIN_MM = 13;
const RING_MAX_MM = 25;
const RULER_SPAN_PX = 641;
const RULER_X0 = 8;
const RULER_BASE = 100;
const RULER_H = 134;

function stepFor(screen: Screen, paired: boolean): 1 | 2 | 3 {
  if (screen === "gender") return 1;
  if (screen === "pair") return paired ? 2 : 1;
  if (screen === "result" || screen === "kit") return 3;
  return 2;
}

function SliderFoot({
  label,
  min,
  max,
  step,
  value,
  onChange,
  onBack,
  onContinue,
  ariaLabel,
}: {
  label?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  onBack: () => void;
  onContinue: () => void;
  ariaLabel: string;
}) {
  return (
    <div className="velia-f-row">
      <Pill tone="light" back onClick={onBack}>Back</Pill>
      <div className="velia-f-mid">
        {label != null ? <div className="velia-f-label">{label}</div> : null}
        <input
          type="range"
          className="velia-range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(+event.target.value)}
          aria-label={ariaLabel}
        />
      </div>
      <Pill onClick={onContinue}>Continue</Pill>
    </div>
  );
}

function StripRuler({
  mmPerPx,
  lengthMm,
  onLengthChange,
}: {
  mmPerPx: number;
  lengthMm: number;
  onLengthChange: (mm: number) => void;
}) {
  // Stored calibration is mm per CSS px; prototype ruler math uses px per mm.
  const pxPerMm = mmPerPx > 0 ? 1 / mmPerPx : 0;
  const last = pxPerMm > 0 ? Math.floor(RULER_SPAN_PX / pxPerMm) : 0;
  const ticks: ReactNode[] = [];
  for (let mm = 0; mm <= last; mm += 1) {
    const x = RULER_X0 + mm * pxPerMm + 0.5;
    const h = mm % 5 === 0 ? 32 : 20;
    ticks.push(
      <line key={`t-${mm}`} x1={x} y1={RULER_BASE - h} x2={x} y2={RULER_BASE} stroke="#808080" strokeWidth={1} />,
    );
    if (mm % 10 === 0) {
      ticks.push(
        <text
          key={`l-${mm}`}
          x={x}
          y={RULER_BASE + 29}
          fontSize={16}
          fontWeight={500}
          textAnchor="middle"
          fill="#000"
        >
          {mm}
        </text>,
      );
    }
  }
  const mx = RULER_X0 + lengthMm * pxPerMm;

  const setFromClientX = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const mm = ((clientX - rect.left) * 656 / rect.width - RULER_X0) / pxPerMm;
    const next = Math.min(STRIP_MAX_MM, Math.max(STRIP_MIN_MM, Math.round(mm * 2) / 2));
    onLengthChange(next);
  };

  return (
    <div
      className="velia-ruler"
      aria-label="Millimetre ruler"
      onPointerDown={(event) => {
        const svg = event.currentTarget.querySelector("svg");
        if (!svg) return;
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        setFromClientX(event.clientX, svg);
      }}
      onPointerMove={(event) => {
        if (event.buttons !== 1) return;
        const svg = event.currentTarget.querySelector("svg");
        if (!svg) return;
        setFromClientX(event.clientX, svg);
      }}
    >
      <svg width="100%" height={RULER_H} viewBox={`0 0 656 ${RULER_H}`} preserveAspectRatio="xMinYMid meet" aria-hidden>
        {ticks}
        <line x1={mx} y1={0} x2={mx} y2={RULER_BASE} stroke="#2171ff" strokeWidth={3} />
        <rect className="grab" x={mx - 12} y={0} width={24} height={RULER_BASE} fill="transparent" />
      </svg>
    </div>
  );
}

type Props = {
  onClose: () => void;
  onComplete: (outcome: Outcome) => void;
};

export function SizingModal({ onClose, onComplete }: Props) {
  const [screen, setScreen] = useState<Screen>("gender");
  const [gender, setGender] = useState<Gender | null>(null);
  const [oneHand, setOneHand] = useState<HandSide>("left");
  const [paired, setPaired] = useState(false);
  const [ohSession, setOhSession] = useState<OneHandSession | null>(null);
  const [ohFinger, setOhFinger] = useState<FingerKey>("index");
  const [aiSize, setAiSize] = useState<number | null>(null);
  const [comfortFingers, setComfortFingers] = useState<string[]>([]);
  const [pickCard, setPickCard] = useState<MethodId>("known");
  const [pickTouched, setPickTouched] = useState(false);
  const [cameraSize, setCameraSize] = useState<CameraSize | null>(null);
  const [cameraMatched, setCameraMatched] = useState(false);
  const [picks, setPicks] = useState<FingerPick[]>([]);
  const [idx, setIdx] = useState(0);
  const [readings, setReadings] = useState<FlowReading[]>([]);
  const [result, setResult] = useState<{ us: AvailableUsSize; okCount: number } | null>(null);
  const [pending, setPending] = useState<MethodId | null>(null);
  const [calibration, setCalibration] = useState<StoredCalibration | null>(null);
  const [knownMm, setKnownMm] = useState(57);
  const [kitUs, setKitUs] = useState<number | null>(null);
  const [diameterMm, setDiameterMm] = useState(18.14);
  const [calScale, setCalScale] = useState(1);
  const [stripMm, setStripMm] = useState(57);
  const [stripGuide, setStripGuide] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadCalibration();
    setCalibration(stored);
    if (stored?.scale) setCalScale(stored.scale);
  }, []);

  useEffect(() => {
    if (screen === "cal") setCalScale(calibration?.scale ?? 1);
  }, [screen, calibration?.scale]);

  useEffect(() => {
    // Escape only closes the small paper-strip guide; it never leaves the sizing flow.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && stripGuide) setStripGuide(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stripGuide]);

  const current = picks[idx];
  const fingerLabel = current ? fingerPhrase(current.hand, current.finger) : "finger";
  const nextAdvice = nextFingerAdvice(picks, idx);
  const hubDecision = decideReadings(readings);
  const pickMode = aiSize != null;
  // A measurement that lands on the same US size as the photo confirms it, whatever the fit label says.
  const confirmed = aiSize != null && readings.some((r) => r.us != null && Number(r.us) === aiSize && !r.belowChart);
  const finishConfirmed = () => {
    if (aiSize == null) return;
    setCameraMatched(true);
    setResult({ us: aiSize as AvailableUsSize, okCount: readings.length + 1 });
    setMsg(null);
    setScreen("result");
  };
  const methodUsed = (card: MethodId) => readings.some((r) => r.id === card);
  const activeCard: MethodId = methodUsed(pickCard) ? (PICK_CARDS.find((c) => !methodUsed(c.id))?.id ?? pickCard) : pickCard;
  const openPick = (card: MethodId) => {
    openMethod(card);
  };

  const resetFinger = (fingerIndex: number) => {
    setIdx(fingerIndex);
    setReadings([]);
    setCameraMatched(false);
    setResult(null);
    setPending(null);
    setKnownMm(57);
    setKitUs(null);
    setDiameterMm(18.14);
    setStripMm(57);
    setMsg(null);
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
    setScreen(id === "known" ? "known" : "kitSizer");
  };

  const settle = (list: FlowReading[]) => {
    const decision = decideReadings(list);
    if (decision.d === "recommend") {
      setReadings(list);
      setResult({ us: decision.us, okCount: decision.okCount });
      setMsg(null);
      setScreen("result");
      return;
    }
    if (decision.d === "next") {
      if (idx + 1 < picks.length) {
        resetFinger(idx + 1);
        setMsg(nextFingerAdvice(picks, idx)?.body ?? "Try the next finger.");
      } else {
        setScreen("kit");
      }
      return;
    }
    if (decision.d === "more") return;
    setReadings(list);
    setMsg(
      decision.why === "sizes"
        ? "Your measurements point to different sizes. Remeasure this finger."
        : "Your measurements don't agree yet. Add one more method.",
    );
    setScreen("hub");
  };

  const commit = (reading: FlowReading) => {
    const list = [...readings.filter((item) => item.id !== reading.id), reading];
    setReadings(list);
    // Back on the method page nothing is selected yet: a second click on the same spot must not start another method.
    setPickTouched(false);
    if (aiSize != null && reading.us != null && Number(reading.us) === aiSize && !reading.belowChart) {
      // The photo and this method point to the same size: that is the answer.
      setCameraMatched(true);
      setResult({ us: reading.us, okCount: 2 });
      setMsg(null);
      setScreen("result");
      return;
    }
    setCameraMatched(false);
    setMsg(
      aiSize != null && reading.us != null
        ? `This method points to US ${reading.us}, your photo said ${aiSize}. Try another method to confirm.`
        : `Saved: ${readingChip(reading).label}.`,
    );
    setResult(null);
    setScreen("hub");
  };

  const goBack = () => {
    if (screen === "hub") setScreen(ohSession ? "sizes" : "gender");
    else if (screen === "kit") setScreen("hub");
    else if (screen === "result") setScreen("hub");
    else setScreen("hub");
  };

  const title =
    screen === "gender" || screen === "pair" || screen === "sizes" || (screen === "hub" && aiSize != null)
      ? "Find your size"
      : screen === "kit"
        ? "Sizing kit"
        : screen === "cal" || screen === "ring" || screen === "strip" || screen === "result"
          ? "Find your size"
          : "Measure";

  const resultLoose = Boolean(
    result && !cameraMatched && readings.some((reading) => reading.color === "red") && !readings.some((reading) => reading.color === "green"),
  );
  const scaleMarks = [
    { label: "Snug", at: 0.92 },
    { label: "Comfortable", at: 33.7 },
    { label: "A bit loose", at: 67.4 },
    { label: "Slips off", at: 100 },
  ] as const;
  const scaleMe = resultLoose ? 2 : 1;

  const cardHeightPx = DEFAULT_CARD_HEIGHT_CSS_PX * calScale;
  const cardWidthPx = cardHeightPx * (CARD_WIDTH_MM / CARD_HEIGHT_MM);
  const ringHolePx = calibration ? diameterMm / calibration.mmPerPx : 0;

  const persistCalibration = () => {
    const next: StoredCalibration = {
      mmPerPx: mmPerPxFromOutline(cardHeightPx, CARD_HEIGHT_MM),
      objectId: "credit-card",
      scale: calScale,
      savedAt: Date.now(),
    };
    saveCalibration(next);
    setCalibration(next);
    return next;
  };

  const onPaired = useCallback((done: OneHandSession) => {
    setOhSession(done);
    const view = sizeRows(done);
    const first = view?.rows.find((row) => row.bestFit) ?? view?.rows.find((row) => row.size != null);
    if (first) setOhFinger(first.finger);
    setScreen("sizes");
  }, []);

  const confirmSize = () => {
    const view = ohSession ? sizeRows(ohSession) : null;
    const row = view?.rows.find((item) => item.finger === ohFinger);
    if (!view || !row || row.size == null) return;
    setAiSize(row.size);
    const saved: CameraSize = {
      finger: ohFinger,
      hand: view.hand,
      gender,
      size: row.size,
      display: row.display,
      at: Date.now(),
    };
    setCameraSize(saved);
    try {
      window.localStorage.setItem(CAMERA_STORE_KEY, JSON.stringify(saved));
    } catch {
      /* storage unavailable: the size still travels with the outcome */
    }
    setComfortFingers(
      view.rows
        .filter((item) => item.size === row.size && item.finger !== "thumb")
        .map((item) => item.label.replace(" finger", "").toLowerCase()),
    );
    setPicks([{ hand: view.hand, finger: ohFinger === "little" ? "pinky" : ohFinger }]);
    setIdx(0);
    setReadings([]);
    setCameraMatched(false);
    setResult(null);
    setMsg(null);
    setScreen("hub");
  };

  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (screen === "gender") {
    body = <GenderStep gender={gender} hand={oneHand} onGender={setGender} onHand={setOneHand} />;
    footer = (
      <div className="velia-f-row center">
        <Pill disabled={!gender} onClick={() => gender && setScreen("pair")}>
          Continue
        </Pill>
      </div>
    );
  }

  if (screen === "pair" && gender) {
    body = <OneHandPair gender={gender} hand={oneHand} onConnectedChange={setPaired} onComplete={onPaired} />;
    footer = (
      <div className="velia-f-row">
        <Pill
          tone="light"
          back
          onClick={() => {
            setPaired(false);
            setScreen("gender");
          }}
        >
          Back
        </Pill>
      </div>
    );
  }

  if (screen === "sizes" && ohSession) {
    body = <OneHandSizes session={ohSession} selected={ohFinger} onSelect={setOhFinger} />;
    footer = (
      <div className="velia-f-row">
        <Pill
          tone="light"
          back
          onClick={() => {
            setOhSession(null);
            setPaired(false);
            setScreen("gender");
          }}
        >
          Back
        </Pill>
        <Pill onClick={confirmSize}>Continue</Pill>
      </div>
    );
  }

  if (screen === "hub") {
    body = (
      <div className="velia-page">
        <div className="velia-head">
          {pickMode && confirmed ? (
            <h1 className="velia-h1 oh-long">
              Your measurement matches your photo: <span style={{ color: "var(--blue)" }}>size {aiSize}</span> it is. You can finish now, or{" "}
              <span style={{ color: "var(--blue)" }}>double check with another method.</span>
            </h1>
          ) : pickMode && readings.length > 0 ? (
            <>
              <h1 className="velia-h1 oh-long">We got two different sizes.</h1>
              <div className="oh-diff" aria-label="Sizes found">
                <div className="oh-tile photo">
                  <i>Your photo</i>
                  <b>Size {aiSize}</b>
                </div>
                <span className="oh-ne" aria-hidden>≠</span>
                {readings.map((r) => (
                  <div key={r.id} className="oh-tile meas">
                    <i>Your measurement</i>
                    <b>{r.us != null ? `US ${r.us}` : "Unclear"}</b>
                  </div>
                ))}
                <p className="oh-diff-note">
                  Pick another method to confirm <span aria-hidden>↓</span>
                </p>
              </div>
            </>
          ) : pickMode ? (
            <>
              <h1 className="velia-h1 oh-long">
                Your recommended <span style={{ color: "var(--blue)" }}>Velia size is {aiSize}</span>.
                {comfortFingers.length > 0 && (
                  <>
                    {" "}It should feel comfortable on your {comfortFingers.join(" and ")} {comfortFingers.length > 1 ? "fingers" : "finger"}.
                  </>
                )}{" "}
                Let&apos;s double check it with <span style={{ color: "var(--blue)" }}>one of the other methods.</span>
              </h1>
            </>
          ) : (
            <>
              <h1 className="velia-h1">Measure your {fingerLabel}</h1>
              <p className="velia-desc">Each method shows its own result. Finish after two, or keep measuring through all four.</p>
            </>
          )}
        </div>
        {msg && !pickMode && <div className="msg blue">{msg}</div>}
        {pickMode ? (
          <div className="velia-pick" role="radiogroup" aria-label="Method">
            {PICK_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                role="radio"
                aria-checked={activeCard === card.id}
                disabled={methodUsed(card.id)}
                className={`velia-pick-card ${pickTouched && activeCard === card.id ? "on" : ""}`}
                onClick={() => {
                  setPickCard(card.id);
                  setPickTouched(true);
                }}
                onDoubleClick={() => openPick(card.id)}
              >
                <span className={`velia-pick-art ${card.id}`} aria-hidden>
                  {card.id === "known" && (
                    <>
                      <i data-n="6" />
                      <i data-n="8" />
                      <i data-n="12" />
                    </>
                  )}
                  {card.id === "kit" && (
                    <span className="kit">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                  {card.id === "ring" && <span className="rot"><img src="/velia/pick-ring.png" alt="" /></span>}
                  {card.id === "strip" && <img className="strip" src="/velia/pick-strip.png" alt="" />}
                </span>
                <span className="txt">
                  <b>{card.title}</b>
                  <span className="sub">
                    {card.sub.split("\n").map((line, i) => (
                      <span key={i} className="ln">{line}</span>
                    ))}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {!pickMode && readings.length >= 2 && hubDecision.d === "recommend" && (
          <div className="msg blue">
            Your recommended size is US {hubDecision.us}. Finish sizing now, or measure with another method.
          </div>
        )}
        {!pickMode && readings.length >= 2 && hubDecision.d === "remeasure" && (
          <div className="msg amber">
            {hubDecision.why === "sizes"
              ? "These readings indicate different US sizes. Remeasure this finger."
              : "These readings are tied or disagree. Remeasure this finger."}
          </div>
        )}
        <div className="velia-methods" hidden={pickMode}>
          {METHODS.map((method) => {
            const saved = readings.find((reading) => reading.id === method.id);
            const chip = saved ? readingChip(saved) : null;
            const sub =
              saved?.circMm != null
                ? `Measured ${formatMm(saved.circMm, 1)} mm`
                : saved?.tooLarge && saved.enteredUs != null
                  ? `Entered US ${saved.enteredUs}`
                  : method.sub;
            return (
              <button
                key={method.id}
                type="button"
                className="velia-method"
                disabled={Boolean(saved)}
                onClick={() => openMethod(method.id)}
              >
                <span className="tx">
                  <b>{method.title}</b>
                  <span>{sub}</span>
                </span>
                {saved && chip ? (
                  <span className={chip.className}>{chip.label}</span>
                ) : (
                  <img className="arr" src="/velia/icon-arrow.svg" alt="" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
    footer = (
      <div className="velia-f-row">
        <Pill tone="light" back onClick={goBack}>Back</Pill>
        <div className="velia-f-right">
          {confirmed && <Pill onClick={finishConfirmed}>Finish</Pill>}
          {!confirmed && hubDecision.d === "recommend" && (
            <Pill onClick={() => settle(readings)}>Finish</Pill>
          )}
          {!confirmed && hubDecision.d === "remeasure" && (
            <Pill onClick={() => resetFinger(idx)}>Remeasure</Pill>
          )}
          {!confirmed && hubDecision.d === "next" && (
            <Pill onClick={() => settle(readings)}>{nextAdvice?.action ?? "Next finger"}</Pill>
          )}
          {pickMode && (confirmed || hubDecision.d === "more") && PICK_CARDS.some((c) => !methodUsed(c.id)) && (
            <Pill disabled={!pickTouched} onClick={() => openPick(activeCard)}>Continue</Pill>
          )}
          {!(pickMode) && hubDecision.d === "more" && readings.length < 4 && (
            <Pill
              onClick={() => {
                const next = METHODS.find((m) => !readings.some((r) => r.id === m.id));
                if (next) openMethod(next.id);
              }}
            >
              Continue
            </Pill>
          )}
        </div>
      </div>
    );
  }

  if (screen === "known") {
    body = (
      <div className="velia-page">
        <div className="velia-head">
          <h1 className="velia-h1">What size did the jeweler give you?</h1>
          <p className="velia-desc">For your {fingerLabel}. Use the circumference in millimetres.</p>
        </div>
        <div className="velia-known">
          <button type="button" aria-label="Smaller" className="pill light" style={{ width: 40, padding: 0 }} onClick={() => setKnownMm((v) => Math.max(40, +(v - 0.1).toFixed(1)))}>−</button>
          <div style={{ minWidth: 120, textAlign: "center" }}>
            <p className="velia-desc" style={{ margin: 0 }}>Millimetres</p>
            <p className="velia-h1" style={{ fontSize: 56, lineHeight: 1, marginTop: 8 }}>{knownMm.toFixed(1)}</p>
          </div>
          <button type="button" aria-label="Larger" className="pill light" style={{ width: 40, padding: 0 }} onClick={() => setKnownMm((v) => Math.min(80, +(v + 0.1).toFixed(1)))}>+</button>
        </div>
      </div>
    );
    footer = (
      <div className="velia-f-row">
        <Pill tone="light" back onClick={goBack}>Back</Pill>
        <Pill onClick={() => commit(readingFromCirc("known", knownMm))}>Save {knownMm.toFixed(1)} mm</Pill>
      </div>
    );
  }

  if (screen === "kitSizer") {
    body = (
      <div className="velia-page">
        <div className="velia-head">
          <h1 className="velia-h1">Which sizer felt comfortable on your {fingerLabel}?</h1>
          <p className="velia-desc">Pick the US size you&apos;d happily wear all day.</p>
        </div>
        <div className="seg velia-region" role="group" aria-label="Size system">
          <button type="button" className="on" aria-pressed="true">US</button>
          <button type="button" disabled aria-disabled="true" title="Coming soon">UK</button>
          <button type="button" disabled aria-disabled="true" title="Coming soon">EU</button>
        </div>
        <div className="velia-grid">
          {COMPETITOR_US_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={`gchip ${kitUs === size ? "on" : ""}`}
              onClick={() => setKitUs(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    );
    footer = (
      <div className="velia-f-row">
        <Pill tone="light" back onClick={goBack}>Back</Pill>
        <Pill
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
        >
          {kitUs == null ? "Choose the sizer" : `Save US ${kitUs}`}
        </Pill>
      </div>
    );
  }

  if (screen === "cal") {
    body = (
      <div className="velia-page">
        <div className="velia-head">
          <h1 className="velia-h1">First, calibrate your screen</h1>
          <p className="velia-desc">
            Hold any bank or loyalty card against the screen and resize the outline to match it. Only needed once.
          </p>
        </div>
        <div className="velia-note">
          <img src="/velia/icon-info-blue.svg" alt="" />
          <span>Nothing is scanned. We don&apos;t read or store any card data.</span>
        </div>
        <div className="velia-card-zone" aria-label="Card outline">
          <div
            className="velia-card-outline"
            style={{ width: cardWidthPx, height: cardHeightPx }}
          />
        </div>
      </div>
    );
    footer = (
      <SliderFoot
        min={0.4}
        max={2.5}
        step={0.01}
        value={calScale}
        onChange={setCalScale}
        onBack={() => setScreen("hub")}
        onContinue={() => {
          persistCalibration();
          setScreen(pending === "strip" ? "strip" : pending === "ring" ? "ring" : "hub");
        }}
        ariaLabel="Card scale"
      />
    );
  }

  if (screen === "ring" && calibration) {
    body = (
      <div className="velia-page">
        <div className="velia-head">
          <h1 className="velia-h1">Use a ring you wear on your {fingerLabel}</h1>
          <p className="velia-desc">
            Lay it on the screen and resize the circle to its inner edge. Wear it on a different finger?{" "}
            <button type="button" className="velia-link" onClick={() => setScreen(ohSession ? "sizes" : "gender")}>Change finger</button>
          </p>
          <p className="velia-desc">
            <button
              type="button"
              className="velia-link"
              onClick={() => {
                setPending("ring");
                setScreen("cal");
              }}
            >
              Recalibrate screen
            </button>
          </p>
        </div>
        <div className="velia-ring-zone" aria-label="Ring outline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/velia/ring-circle.svg"
            alt=""
            style={{ width: ringHolePx, height: ringHolePx }}
          />
        </div>
      </div>
    );
    footer = (
      <SliderFoot
        label={`Inner diameter ${formatMm(diameterMm, 1)} mm`}
        min={RING_MIN_MM}
        max={RING_MAX_MM}
        step={0.1}
        value={diameterMm}
        onChange={setDiameterMm}
        onBack={() => setScreen("hub")}
        onContinue={() => commit(readingFromCirc("ring", diameterToCircumference(diameterMm)))}
        ariaLabel="Ring inner diameter"
      />
    );
  }

  if (screen === "strip" && calibration) {
    body = (
      <div className="velia-page">
        <div className="velia-title-row">
          <h1 className="velia-h1">Paper strip</h1>
          <button
            type="button"
            className="velia-link"
            onClick={() => {
              setPending("strip");
              setScreen("cal");
            }}
          >
            Recalibrate screen
          </button>
        </div>
        <div className="velia-steps">
          <div className="velia-step">
            <span>Step 1</span>
            <p>Wrap a thin paper strip around your {fingerLabel}: comfortable, not tight.</p>
          </div>
          <div className="velia-step">
            <span>Step 2</span>
            <p>Mark where it overlaps.</p>
          </div>
          <div className="velia-step">
            <span>Step 3</span>
            <p>Lay it on the ruler from 0 and move the blue line to your mark.</p>
          </div>
        </div>
        <StripRuler
          mmPerPx={calibration.mmPerPx}
          lengthMm={stripMm}
          onLengthChange={setStripMm}
        />
      </div>
    );
    footer = (
      <SliderFoot
        label={`Strip length ${formatMm(stripMm, 1)} mm`}
        min={STRIP_MIN_MM}
        max={STRIP_MAX_MM}
        step={0.5}
        value={stripMm}
        onChange={setStripMm}
        onBack={() => setScreen("hub")}
        onContinue={() => commit(readingFromCirc("strip", stripMm))}
        ariaLabel="Strip length"
      />
    );
  }

  if (screen === "result" && result) {
    body = (
      <div className="velia-page">
        <div className={`velia-result ${resultLoose ? "" : "fg"}`}>
          <div className="velia-res">
            <p className="cap">Your Velia size</p>
            <p className="big">{result.us}</p>
            <p className="fit">
              {resultLoose ? "Should feel a little loose. That works." : "Should feel comfortable."}
            </p>
            <p className="meta">
              {cameraMatched && comfortFingers.length > 0
                ? `${comfortFingers.join(" and ").replace(/^./, (c) => c.toUpperCase())} ${comfortFingers.length > 1 ? "fingers" : "finger"}`
                : fingerLabel.charAt(0).toUpperCase() + fingerLabel.slice(1)}
              {"・"}
              {cameraMatched
                ? `${readings.length + 1} of ${readings.length + 1} measurements agree`
                : `${result.okCount} of ${readings.length} measurements agree`}
            </p>
          </div>
          <div className="velia-scale" aria-hidden>
            <div className="ln ok" />
            <div className="ln bad" />
            <div className="halo" style={{ left: `${scaleMarks[scaleMe].at}%` }} />
            {scaleMarks.map((mark, index) => (
              <div
                key={mark.label}
                className={`dot ${index === 3 ? "off" : ""}`}
                style={{ left: `${mark.at}%` }}
              />
            ))}
            {scaleMarks.map((mark, index) => (
              <div
                key={`lb-${mark.label}`}
                className={`lb ${index === 0 ? "first" : ""} ${index === 3 ? "last" : ""} ${index === scaleMe ? "me" : ""}`}
                style={{ left: `${mark.at}%` }}
              >
                {mark.label}
              </div>
            ))}
          </div>
          <div className="velia-why">
            <img src="/velia/why-ring.svg" alt="" />
            <div className="tx">
              <b>Why a bit of room is fine</b>
              <p>
                18 sensors sit all around your finger, and Velia reads from the best one each time. It doesn&apos;t need a tight fit.
              </p>
            </div>
          </div>
          <div className="velia-exchange">
            <img src="/velia/icon-info.svg" alt="" />
            <span>If the size isn&apos;t right, your first exchange is free</span>
          </div>
        </div>
      </div>
    );
    footer = (
      <div className="velia-f-row">
        <Pill tone="light" back onClick={() => setScreen("hub")}>Back</Pill>
        <div className="velia-f-right">
          {nextAdvice && (
            <Pill tone="light" onClick={() => resetFinger(idx + 1)}>{nextAdvice.action}</Pill>
          )}
          <Pill onClick={() => onComplete({ kind: "size", us: result.us, camera: cameraSize })}>Done</Pill>
        </div>
      </div>
    );
  }

  if (screen === "kit") {
    body = (
      <div className="velia-page">
        <div className="velia-kit-panel">
          <img src="/velia/kit.png" alt="Velia sizing kit" />
          <h1>Try sizes at home with the sizing kit</h1>
          <p className="velia-desc" style={{ maxWidth: 360 }}>
            Wear each sizer for a few minutes, pick the one that feels comfortable, then order your ring. $20 is deducted from your ring.
          </p>
          <div className="velia-kit-cards">
            <div className="velia-kit-card">
              <b>Your $20 comes back</b>
              <p>A personal code takes the full $20 off your ring.</p>
            </div>
            <div className="velia-kit-card">
              <b>Made to be passed on</b>
              <p>One kit can size many fingers. Give it to a friend when you&apos;re done.</p>
            </div>
          </div>
        </div>
      </div>
    );
    footer = (
      <div className="velia-f-row">
        <Pill tone="light" back onClick={goBack}>Back</Pill>
        <Pill onClick={() => onComplete({ kind: "kit", camera: cameraSize })}>Get the sizing kit · $20</Pill>
      </div>
    );
  }

  return (
    <>
      <VeliaModalShell title={title} step={stepFor(screen, paired)} onClose={onClose} footer={footer}>
        {body}
      </VeliaModalShell>
      {stripGuide && (
        <div className="velia-scrim" style={{ zIndex: 80 }} role="presentation" onClick={() => setStripGuide(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="strip-guide-title"
            className="velia-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="velia-m-head">
              <h2 id="strip-guide-title">Paper strip</h2>
              <button type="button" className="velia-m-close" aria-label="Close" onClick={() => setStripGuide(false)}>
                <img src="/velia/icon-close.svg" alt="" />
              </button>
            </div>
            <div className="velia-m-body">
              <div className="velia-guide">
                <div className="velia-head">
                  <h1 className="velia-h1">How to use a paper strip</h1>
                  <p className="velia-desc">
                    Wrap a thin strip around your {fingerLabel}, mark where it overlaps, then measure that length on screen.
                  </p>
                </div>
                <div className="velia-guide-fig">
                  <img
                    src="/paper-strip-method.png"
                    alt="A paper strip wrapped around a finger, with a pen mark where the paper overlaps."
                  />
                </div>
                <ol className="velia-guide-steps">
                  {STRIP_STEPS.map(([stepTitle, text], index) => (
                    <li key={stepTitle}>
                      <span className="n">{index + 1}</span>
                      <p>
                        <strong>{stepTitle}.</strong> <span>{text}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="velia-m-foot" aria-hidden />
            <div className="velia-f-row center">
              <Pill
                onClick={() => {
                  setStripGuide(false);
                  setPending("strip");
                  setScreen("cal");
                }}
              >
                Measure my strip
              </Pill>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
