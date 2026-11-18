"use client";

import { UiIcon } from "@/components/UiIcon";
import { validFingerPlan, type FingerPick, type WearFinger, type WearHand } from "@/lib/explore-flow";

const FINGERS: { id: WearFinger; label: string; phrase: string }[] = [
  { id: "thumb", label: "Thumb", phrase: "thumb" },
  { id: "index", label: "Index", phrase: "index finger" },
  { id: "middle", label: "Middle", phrase: "middle finger" },
  { id: "ring", label: "Ring", phrase: "ring finger" },
  { id: "pinky", label: "Little", phrase: "little finger" },
];

const ROLES = ["Primary", "Second", "Third"] as const;

const LAYOUT: Record<WearFinger, { left: number; top: string; width: number; height: string; rotate: number }> = {
  thumb: { left: 2, top: "48%", width: 24, height: "36%", rotate: -32 },
  index: { left: 24, top: "12%", width: 17, height: "48%", rotate: -6 },
  middle: { left: 42, top: "3%", width: 17, height: "54%", rotate: 0 },
  ring: { left: 60, top: "10%", width: 17, height: "48%", rotate: 6 },
  pinky: { left: 77, top: "22%", width: 15, height: "38%", rotate: 12 },
};

export function fingerPhrase(hand: WearHand, finger: WearFinger): string {
  const name = FINGERS.find((item) => item.id === finger)?.phrase ?? "finger";
  return `${hand} ${name}`;
}

export function pickLabel(pick: FingerPick): string {
  const name = FINGERS.find((item) => item.id === pick.finger)?.label ?? "Finger";
  return `${pick.hand === "left" ? "Left" : "Right"} ${name}`;
}

export function nextFingerAdvice(
  picks: readonly FingerPick[] | null | undefined,
  currentIndex = 0,
): { body: string; action: string } | null {
  const finger = picks?.[currentIndex + 1];
  if (!finger) return null;
  const place = fingerPhrase(finger.hand, finger.finger);
  const ordinal = currentIndex === 0 ? "second" : "third";
  return {
    body: `Measure your ${place} next. Your ${ordinal} finger shows us the size that will feel right.`,
    action: `Measure my ${place}`,
  };
}

function spotFor(side: WearHand, finger: WearFinger) {
  const base = LAYOUT[finger];
  if (side === "right") return base;
  return { ...base, left: 100 - base.left - base.width, rotate: -base.rotate };
}

export function FingerPlanStep({
  picks,
  onPicksChange,
  onBack,
  onContinue,
}: {
  picks: FingerPick[];
  onPicksChange: (picks: FingerPick[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const ready = validFingerPlan(picks);
  const nextRole = ROLES[picks.length] ?? null;

  const toggleFinger = (pick: FingerPick) => {
    const index = picks.findIndex((item) => item.hand === pick.hand && item.finger === pick.finger);
    if (index >= 0) {
      onPicksChange(picks.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    if (picks.length >= 3) return;
    onPicksChange([...picks, pick]);
  };

  return (
    <div className="text-center">
      <h2 className="font-[family-name:var(--font-display)] text-[28px] leading-tight text-[var(--ink)]">
        Where will you wear it?
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
        Tap three fingers, from either hand. Your right ring finger and your left ring finger are two different choices.
      </p>

      <p className="mono-label mt-6 text-[var(--gold-deep)]">
        {nextRole ? `Tap your ${nextRole.toLowerCase()} finger` : "Three fingers selected"}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["left", "right"] as const).map((side) => (
          <HandFigure key={side} side={side} picks={picks} onToggle={toggleFinger} />
        ))}
      </div>

      <ol className="mt-4 grid grid-cols-3 gap-2 text-left">
        {ROLES.map((role, index) => {
          const pick = picks[index];
          const active = picks.length === index;
          return (
            <li
              key={role}
              className={`rounded-2xl border px-2 py-3 ${
                pick
                  ? "border-[var(--ink)] bg-[var(--surface)]"
                  : active
                    ? "border-[var(--gold-deep)] bg-[var(--gold-soft)]"
                    : "border-[var(--border)] bg-[var(--surface-2)]"
              }`}
            >
              <p className="mono-label text-[var(--gold-deep)]">{role}</p>
              <p className="mt-1 text-sm text-[var(--ink)]">{pick ? pickLabel(pick) : "—"}</p>
            </li>
          );
        })}
      </ol>

      <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-[var(--muted)]" aria-live="polite">
        {ready
          ? `If your ${fingerPhrase(picks[0].hand, picks[0].finger)} feels tight, we’ll ask you to measure your ${fingerPhrase(picks[1].hand, picks[1].finger)}.`
          : "Tap a chosen finger again if you want to change it."}
      </p>

      <div className="step-actions mt-6">
        <button type="button" onClick={onBack} className="btn-secondary">
          ‹ Back
        </button>
        <button type="button" onClick={onContinue} disabled={!ready} className="btn-primary">
          Continue <UiIcon name="arrow" />
        </button>
      </div>
    </div>
  );
}

export function HandFigure({
  side,
  picks,
  onToggle,
}: {
  side: WearHand;
  picks: FingerPick[];
  onToggle: (pick: FingerPick) => void;
}) {
  return (
    <div>
      <div className="relative mx-auto h-[clamp(120px,18vh,180px)] w-full max-w-[180px]">
        <svg viewBox="0 0 200 280" className="absolute inset-0 h-full w-full" aria-hidden>
          <path
            d="M48 150c-8 18-10 48-2 78 10 28 98 32 118 4 12-28 8-62-2-82-14-10-100-14-114 0z"
            fill="var(--surface-2)"
            stroke="var(--border)"
          />
          <path d="M70 228c18 16 52 16 72 0" fill="none" stroke="var(--border)" strokeWidth="2" />
        </svg>
        {FINGERS.map((finger) => {
          const rank = picks.findIndex((pick) => pick.hand === side && pick.finger === finger.id);
          const selected = rank >= 0;
          const spot = spotFor(side, finger.id);
          return (
            <button
              key={finger.id}
              type="button"
              aria-pressed={selected}
              aria-label={
                selected
                  ? `${side} ${finger.phrase}, ${ROLES[rank].toLowerCase()} choice. Tap to remove.`
                  : picks.length >= 3
                    ? `${side} ${finger.phrase}. Remove a finger before choosing another.`
                    : `${side} ${finger.phrase}, choose as ${ROLES[picks.length].toLowerCase()}`
              }
              disabled={!selected && picks.length >= 3}
              onClick={() => onToggle({ hand: side, finger: finger.id })}
              className={`absolute flex flex-col items-center rounded-full border-2 pt-2 transition duration-150 ${
                selected
                  ? "border-[var(--ink)] bg-[var(--ink)] text-white shadow-[0_10px_18px_#243e3524]"
                  : "border-[var(--border)] bg-white text-[var(--ink)] hover:border-[var(--gold)]"
              } disabled:cursor-default disabled:opacity-60`}
              style={{
                left: `${spot.left}%`,
                top: spot.top,
                width: `${spot.width}%`,
                height: spot.height,
                transform: `rotate(${spot.rotate}deg)`,
              }}
            >
              <span className="inline-flex" style={{ transform: `rotate(${-spot.rotate}deg)` }}>
                {selected ? (
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                      rank === 0 ? "bg-[var(--gold)] text-[var(--ink)]" : "bg-white text-[var(--ink)]"
                    }`}
                  >
                    {rank + 1}
                  </span>
                ) : (
                  <span className="text-[9px] font-medium tracking-wide">{finger.label}</span>
                )}
              </span>
              {selected && (
                <span
                  className={`mt-2 block h-2 rounded-full border-2 border-[var(--gold-light)] ${
                    rank === 0 ? "w-5 bg-[var(--gold)]" : "w-4"
                  }`}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-sm font-medium capitalize text-[var(--ink)]">{side} hand</p>
    </div>
  );
}
