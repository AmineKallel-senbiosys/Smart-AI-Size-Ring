"use client";

import { useMemo, useState } from "react";
import {
  circumferenceToDiameter,
  diameterToCircumference,
  findNearestByCircumference,
  findNearestByDiameter,
  formatMm,
  formatUsSize,
} from "@/lib/convert";
import { Stage, StepHeading } from "./WizardShell";

type Props = {
  mode: "ring" | "finger";
  valueMm: number;
  onAdjust: () => void;
  onRestart: () => void;
};

export function ResultPanel({ mode, valueMm, onAdjust, onRestart }: Props) {
  const [shared, setShared] = useState(false);

  const converted = useMemo(
    () =>
      mode === "ring"
        ? findNearestByDiameter(valueMm)
        : findNearestByCircumference(valueMm),
    [mode, valueMm]
  );

  const diameterMm =
    mode === "ring" ? valueMm : circumferenceToDiameter(valueMm);
  const circumferenceMm =
    mode === "finger" ? valueMm : diameterToCircumference(valueMm);
  const { row } = converted;

  const share = async () => {
    const text = `My finger circumference is ${formatMm(circumferenceMm)} mm (Ø ${formatMm(diameterMm, 2)} mm · US ${formatUsSize(row.us)}, UK ${row.uk}, EU ${
      row.eu ?? "—"
    }, JP ${row.jp ?? "—"}) — measured with Airing`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My ring measure", text });
        return;
      } catch {
        /* fall back to clipboard */
      }
    }
    await navigator.clipboard?.writeText(text);
    setShared(true);
    setTimeout(() => setShared(false), 1800);
  };

  return (
    <div className="space-y-5">
      <StepHeading title="Your circumference">
        Based on your measurement — saved automatically on this device.
      </StepHeading>

      <Stage caption="Your measured circumference">
        <div className="text-center">
          <p className="mono-label text-[var(--gold-deep)]">Circumference</p>
          <p className="font-[family-name:var(--font-display)] text-6xl leading-none text-[var(--gold-light)]">
            {formatMm(circumferenceMm)}
            <span className="ml-2 text-2xl text-[#8c7c66]">mm</span>
          </p>
          <p className="mono mt-3 text-[11px] text-[#8c7c66]">
            Ø diameter {formatMm(diameterMm, 2)} mm
          </p>
        </div>
      </Stage>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "US", value: formatUsSize(row.us) },
          { label: "UK", value: row.uk },
          { label: "EU", value: row.eu != null ? String(row.eu) : "—" },
          { label: "JP", value: row.jp != null ? String(row.jp) : "—" },
        ].map((cell) => (
          <div
            key={cell.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-center"
          >
            <p className="mono-label text-[var(--muted)]">{cell.label}</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
              {cell.value}
            </p>
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-[var(--muted)]">
        Tip: for eternity bands or wide settings, consider adding ½ size.
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onAdjust}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
        >
          ‹ Adjust
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
        >
          ↻ Start over
        </button>
        <button
          type="button"
          onClick={share}
          className="gold-fill flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-[filter] hover:brightness-[1.04]"
        >
          {shared ? "Copied" : "Share"}
        </button>
      </div>
    </div>
  );
}
