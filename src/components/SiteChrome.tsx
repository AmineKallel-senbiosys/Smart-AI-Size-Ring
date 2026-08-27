import Link from "next/link";
import { RingMark } from "@/components/RingMark";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)]/80 bg-[var(--surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]"
        >
          <RingMark size={22} />
          <span>
            Air<span className="text-[var(--gold-deep)]">ing</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/explore"
            className="gold-fill rounded-lg px-3.5 py-2 text-sm font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-[filter] hover:brightness-[1.04]"
          >
            Explore size
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[var(--ink)]">
          <RingMark size={18} />
          Airing
        </p>
        <p>Three measures · averaged · US 6 · 8 · 10 · 12</p>
        <p className="mono text-xs">On-device · nothing uploaded</p>
      </div>
    </footer>
  );
}
