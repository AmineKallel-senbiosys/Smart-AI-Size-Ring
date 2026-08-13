import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)]/80 bg-[var(--surface)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-[var(--ink)]"
        >
          Air<span className="text-[var(--accent)]">ing</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/sizer"
            className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            Screen
          </Link>
          <Link
            href="/scan"
            className="accent-fill rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
          >
            Camera scan
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
        <p className="font-[family-name:var(--font-display)] font-semibold text-[var(--ink)]">
          Airing
        </p>
        <p>On-device sizing · nothing uploaded · US · UK · EU · JP</p>
        <p className="mono text-xs">Inspired by guided photo sizing flows</p>
      </div>
    </footer>
  );
}
