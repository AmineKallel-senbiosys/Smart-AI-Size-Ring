import type { Metadata } from "next";
import { RingSizer } from "@/components/sizer/RingSizer";

export const metadata: Metadata = {
  title: "Screen sizer",
  description:
    "Calibrate your screen with a card or coin, then measure a ring or finger.",
};

export default function SizerPage() {
  return (
    <div className="mesh-bg">
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="mono-label text-[var(--accent-deep)]">Screen method</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-[var(--ink)] sm:text-4xl">
          Calibrated screen sizer
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Place a ring you own on the display — or measure a paper strip around
          your finger.
        </p>
        <div className="mt-8">
          <RingSizer />
        </div>
      </div>
    </div>
  );
}
