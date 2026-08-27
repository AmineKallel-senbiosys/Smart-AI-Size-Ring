import Link from "next/link";
import { RingMark } from "@/components/RingMark";

const STEPS = [
  {
    n: "01",
    title: "Use a ring",
    body: "Calibrate your screen, then match a ring you own to the on-screen hole.",
  },
  {
    n: "02",
    title: "Measure your finger",
    body: "Wrap a paper strip around your finger and align it on the calibrated ruler.",
  },
  {
    n: "03",
    title: "Camera on your phone",
    body: "Finish with a guided photo scan — credit card as scale — then enter that Circ.",
  },
  {
    n: "04",
    title: "Get your size",
    body: "We average all three circumferences and map to US 6 · 8 · 10 · 12.",
  },
];

export default function HomePage() {
  return (
    <div className="mesh-bg">
      <section className="relative overflow-hidden border-b border-[var(--border)]/70">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-20 lg:pt-16">
          <div>
            <p className="mono-label text-[var(--gold-deep)]">
              Three measures · One size
            </p>
            <div className="mt-5 flex items-center gap-4">
              <RingMark size={48} />
              <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.6rem,8vw,4.75rem)] font-normal leading-[0.95] tracking-tight text-[var(--ink)]">
                Airing
              </h1>
            </div>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--muted)] sm:text-xl">
              Ring on screen, paper strip, then camera on your phone — we
              average the three circumferences for your best fit.
            </p>
            <div className="mt-8">
              <Link
                href="/explore"
                className="gold-fill inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-[15px] font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_16px_36px_-16px_rgba(184,147,74,0.55)] transition-[filter] hover:brightness-[1.04]"
              >
                Let&apos;s start exploring your size ›
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--muted)]">
              <li>Private — nothing uploaded</li>
              <li>US 6 · 8 · 10 · 12</li>
              <li>On-device</li>
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-[340px] lg:max-w-[380px]">
            <div className="float-y relative aspect-[9/16] overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--stage)] shadow-[0_40px_80px_-28px_rgba(23,18,13,0.45)]">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,#b8934a44,transparent_45%),linear-gradient(180deg,#221c16_0%,#17130f_100%)]" />
              <div className="absolute inset-x-6 top-10 text-center">
                <p className="mono-label text-[var(--gold-light)]">Guided flow</p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-white">
                  Ring · Finger · Camera
                </p>
              </div>
              <div className="absolute inset-x-8 top-[38%] space-y-3">
                {["Ring circ", "Finger circ", "Camera circ"].map((label, i) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 backdrop-blur-md"
                  >
                    <span className="mono-label text-white/55">{label}</span>
                    <span className="font-[family-name:var(--font-display)] text-white">
                      {["57.0", "56.8", "57.3"][i]} mm
                    </span>
                  </div>
                ))}
              </div>
              <div className="absolute inset-x-8 bottom-10 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-md">
                <p className="mono-label text-white/60">Your size</p>
                <p className="font-[family-name:var(--font-display)] text-3xl text-[var(--gold-light)]">
                  US 10
                </p>
              </div>
            </div>
            <div
              className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-[radial-gradient(circle,rgba(184,147,74,0.22),transparent_65%)]"
              aria-hidden
            />
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)]/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="mono-label text-[var(--gold-deep)]">How it works</p>
          <h2 className="mt-3 max-w-xl font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)] sm:text-4xl">
            Three measures. One clear size.
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <article key={s.n} className="border-t border-[var(--border)] pt-5">
                <p className="mono text-xs text-[var(--gold)]">{s.n}</p>
                <h3 className="mt-2 font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  {s.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
