"use client";

import Link from "next/link";
import { RingMark } from "@/components/RingMark";
import { UiIcon } from "@/components/UiIcon";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="RingSize by Velio home"><RingMark size={30} /><span>RingSize<span className="brand-by"> by Velio</span></span></Link>
        <span className="hidden items-center gap-2 text-xs text-[var(--muted)] lg:flex"><span className="h-1.5 w-1.5 rounded-full bg-[var(--ink)]" />Made for your fit</span>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-7 sm:px-8">
        <Link href="/" className="text-base font-medium">RingSize <span className="font-normal text-[var(--muted)]">by Velio</span></Link>
        <p className="text-xs text-[var(--muted)]">Designed around you.</p>
        <p className="flex items-center gap-1.5 text-xs text-[var(--muted)]"><UiIcon name="shield" className="h-3.5 w-3.5" />Private measurements</p>
      </div>
    </footer>
  );
}
