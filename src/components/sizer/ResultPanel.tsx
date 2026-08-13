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
    const text = `My ring size is US ${formatUsSize(row.us)} (UK ${row.uk}, EU ${
      row.eu ?? "—"
    }, JP ${row.jp ?? "—"}) — measured with Airing`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My ring size", text });
        return;
      } catch {
        /* clipboard */
      }
    }
    await navigator.clipboard?.writeText(text);
    setShared(true);
    setTimeout(() => setShared(false), 1800);
  };

  return (
    <div className="space-y-5">
      <StepHeading title="Your ring size">
        Based on your measurement — saved on this device only.
      </StepHeading>

      <Stage caption="Your measured size">
        <div className="text-center">
          <p className="mono-label text-[#8a9aa5]">US Ring Size</p>
          <p className="font-[family-name:var(--font-display)] text-6xl font-extrabold text-[var(--accent-glow)]">
            {formatUsSize(row.us)}
          </p>
          <p className="mono mt-3 text-[11px] text-[#8a9aa5]">
            {formatMm(diameterMm, 2)} mm diameter · {formatMm(circumferenceMm)}{" "}
            mm circumference
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
            <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold">
              {cell.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onAdjust}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm"
        >
          ‹ Adjust
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm"
        >
          ↻ Restart
        </button>
        <button
          type="button"
          onClick={share}
          className="accent-fill flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
        >
          {shared ? "Copied" : "Share"}
        </button>
      </div>
    </div>
  );
}
