"use client";

import type { ReactNode } from "react";

type Props = {
  title: string;
  step?: 1 | 2 | 3;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function VeliaModalShell({ title, step = 1, onClose, children, footer }: Props) {
  return (
    <div className="velia-scrim" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="velia-modal-title"
        className="velia-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="velia-m-head">
          <h2 id="velia-modal-title">{title}</h2>
          <button type="button" className="velia-m-close" aria-label="Close" onClick={onClose}>
            <img src="/velia/icon-close.svg" alt="" />
          </button>
        </div>
        <div className="velia-progress" aria-hidden>
          {[1, 2, 3].map((n) => (
            <i key={n} className={n <= step ? "on" : undefined} />
          ))}
        </div>
        <div className="velia-m-body">{children}</div>
        {footer != null && (
          <>
            <div className="velia-m-foot" aria-hidden />
            {footer}
          </>
        )}
      </div>
    </div>
  );
}

export function Pill({
  tone = "dark",
  back,
  disabled,
  onClick,
  children,
  className = "",
}: {
  tone?: "dark" | "light";
  back?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`pill ${tone} ${back ? "back" : ""} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
