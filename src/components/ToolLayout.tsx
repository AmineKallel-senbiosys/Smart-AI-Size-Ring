import Link from "next/link";
import { UiIcon } from "./UiIcon";

const CONTENT = {
  guide: {
    label: "Guided sizing",
    title: (
      <>
        A gentle fit.
        <br />
        Still <em>accurate.</em>
      </>
    ),
    note: "A few simple measurements. One recommended size.",
    icon: "ring" as const,
  },
  screen: { label: "Screen measure", title: "Your screen. Your sizing tool.", note: "Use a ring you own, or a paper strip.", icon: "ruler" as const },
  camera: { label: "Camera scan", title: "A new angle on your fit.", note: "Your finger, a bank card, and your phone.", icon: "camera" as const },
};

export function ToolLayout({ mode, children }: { mode: keyof typeof CONTENT; children: React.ReactNode }) {
  const content = CONTENT[mode];
  return (
    <div className="tool-layout">
      <aside className="tool-intro">
        <Link href="/" className="back-link"><span aria-hidden>←</span> Overview</Link>
        <p className="eyebrow mt-8 flex items-center gap-2"><UiIcon name={content.icon} className="h-4 w-4" />{content.label}</p>
        <h1 className="tool-title">{content.title}</h1>
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--muted)]">{content.note}</p>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
