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
import { StepHeading } from "./WizardShell";
import { UiIcon } from "@/components/UiIcon";

type Props = {
  mode: "ring" | "finger";
  valueMm: number;
  onAdjust: () => void;
  onRestart: () => void;
};

export function ResultPanel({ mode, valueMm, onAdjust, onRestart }: Props) {
  const [shared, setShared] = useState(false);
  const [shareError, setShareError] = useState("");

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
    setShareError("");
    const text = `My finger circumference is ${formatMm(circumferenceMm)} mm (Ø ${formatMm(diameterMm, 2)} mm · US ${formatUsSize(row.us)}, UK ${row.uk}, EU ${
      row.eu ?? "—"
    }, JP ${row.jp ?? "—"}) — measured with RingSize by Velio`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My ring measure", text });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        /* fall back to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      setShareError("Couldn’t copy. You can note the measurement above.");
    }
  };

  return (
    <div className="space-y-5">
      <StepHeading title="Your measurement">
        Saved on this device.
      </StepHeading>

      <div className="result-hero">
        <div className="result-icon"><UiIcon name="check" /></div>
        <div className="text-center">
          <p className="mono-label text-[var(--gold-deep)]">Circumference</p>
          <p className="mt-4 font-[family-name:var(--font-display)] text-6xl leading-none text-[var(--ink)]">
            {formatMm(circumferenceMm)}
            <span className="ml-2 text-2xl text-[#8c7c66]">mm</span>
          </p>
          <p className="mono mt-3 text-[11px] text-[#8c7c66]">
            Ø diameter {formatMm(diameterMm, 2)} mm
          </p>
        </div>
      </div>

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
        Standard size equivalents. Check your ring’s fit before ordering.
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
          className="btn-primary flex-1"
        >
          {shared ? "Copied" : "Share"}
        </button>
      </div>
      {shareError && <p role="status" className="text-center text-xs text-[var(--muted)]">{shareError}</p>}
    </div>
  );
}
