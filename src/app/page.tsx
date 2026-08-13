import Link from "next/link";

const STEPS = [
  {
    n: "01",
    title: "One guided photo",
    body: "Open the camera from your phone. Place a credit card next to your hand or ring.",
  },
  {
    n: "02",
    title: "Calibrate with the card",
    body: "Match the overlay to the card’s known 85.6 mm edge — that locks real-world scale.",
  },
  {
    n: "03",
    title: "Fit the measure circle",
    body: "Resize to your finger diameter or a ring’s inner edge. US · UK · EU · JP appear live.",
  },
  {
    n: "04",
    title: "Get your size",
    body: "Keep the recommendation, share it, or confirm again with the screen sizer.",
  },
];

export default function HomePage() {
  return (
    <div className="mesh-bg">
      <section className="relative overflow-hidden border-b border-[var(--border)]/70">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-20 lg:pt-16">
          <div>
            <p className="mono-label text-[var(--accent-deep)]">
              AI · Guided photo · On-device
            </p>
            <h1 className="mt-5 font-[family-name:var(--font-display)] text-[clamp(2.6rem,8vw,4.75rem)] font-extrabold leading-[0.95] tracking-tight text-[var(--ink)]">
              Airing
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--muted)] sm:text-xl">
              AI ring sizing for the web. No kits, no charts, no guessing —
              one photo with a credit card as scale.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/scan"
                className="accent-fill inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_16px_36px_-16px_rgba(31,122,108,0.85)] transition-[filter] hover:brightness-105"
              >
                Open camera scan
              </Link>
              <Link
                href="/sizer"
                className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 px-6 py-3.5 text-[15px] font-medium text-[var(--ink)] backdrop-blur transition-colors hover:bg-[var(--surface)]"
              >
                Use screen sizer
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--muted)]">
              <li>Private — nothing uploaded</li>
              <li>US · UK · EU · JP</li>
              <li>Phone-first</li>
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-[340px] lg:max-w-[380px]">
            <div className="float-y relative aspect-[9/16] overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--stage)] shadow-[0_40px_80px_-28px_rgba(13,18,22,0.55)]">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,#1f7a6c44,transparent_45%),linear-gradient(180deg,#152028_0%,#0d1216_100%)]" />
              <div className="absolute inset-x-6 top-10 text-center">
                <p className="mono-label text-[var(--accent-glow)]">Live guide</p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-white">
                  Align · Capture · Size
                </p>
              </div>
              <div className="guide-pulse absolute left-[12%] top-[28%] h-[18%] w-[42%] rounded-md border-2 border-dashed border-[var(--accent-glow)]/80" />
              <div className="guide-pulse absolute bottom-[22%] right-[14%] h-[30%] w-[30%] rounded-[45%] border-2 border-dashed border-white/60" />
              <div className="absolute inset-x-8 bottom-10 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-md">
                <p className="mono-label text-white/60">Recommended</p>
                <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-white">
                  US 7
                </p>
              </div>
            </div>
            <div
              className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-[radial-gradient(circle,rgba(58,168,145,0.22),transparent_65%)]"
              aria-hidden
            />
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)]/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="mono-label text-[var(--accent-deep)]">How it works</p>
          <h2 className="mt-3 max-w-xl font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
            From one photo to the right ring size.
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <article key={s.n} className="border-t border-[var(--border)] pt-5">
                <p className="mono text-xs text-[var(--accent)]">{s.n}</p>
                <h3 className="mt-2 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink)]">
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

      <section>
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)]/80 p-8 backdrop-blur">
            <p className="mono-label text-[var(--accent-deep)]">Mobile</p>
            <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold">
              Camera scan
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Best on a phone. Opens the rear camera, guides card + hand
              placement, then converts the measurement with on-device scale.
            </p>
            <Link
              href="/scan"
              className="accent-fill mt-6 inline-flex rounded-xl px-5 py-3 text-sm font-semibold text-white"
            >
              Start camera flow
            </Link>
          </div>
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)]/80 p-8 backdrop-blur">
            <p className="mono-label text-[var(--accent-deep)]">Desktop · Tablet</p>
            <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold">
              Screen sizer
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Calibrate the display with a physical card or coin, then match a
              ring or paper finger strip — same size chart, no camera needed.
            </p>
            <Link
              href="/sizer"
              className="mt-6 inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg)] px-5 py-3 text-sm font-semibold text-[var(--ink)]"
            >
              Open screen sizer
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
