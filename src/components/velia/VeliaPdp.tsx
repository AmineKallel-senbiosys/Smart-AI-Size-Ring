"use client";

import { useEffect, useState } from "react";
import { SizingModal } from "@/components/velia/SizingModal";
import type { AvailableUsSize } from "@/lib/explore-flow";

const COLORS = [
  { id: "gold", label: "Gold", fill: "linear-gradient(90deg,#e6c58a,#956f41 116.05%)" },
  { id: "silver", label: "Silver", fill: "linear-gradient(90deg,#e5e5e5,#949494 116.05%)" },
  { id: "black", label: "Black", fill: "linear-gradient(90deg,#636363 2.469%,#050709 101.23%)" },
] as const;

const SIZE_CHIPS = [6, 8, 10, 12] as const;

type Mode = "know" | "kit";

type Props = {
  openSizingOnMount?: boolean;
};

export function VeliaPdp({ openSizingOnMount = false }: Props) {
  const [color, setColor] = useState<(typeof COLORS)[number]["id"]>("silver");
  const [mode, setMode] = useState<Mode>("know");
  const [chip, setChip] = useState<number | null>(null);
  const [sizingOpen, setSizingOpen] = useState(openSizingOnMount);
  const [toast, setToast] = useState<string | null>(null);
  const [stackOn, setStackOn] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const colorLabel = COLORS.find((c) => c.id === color)?.label ?? "Silver";
  const canCart = mode === "kit" || chip != null;

  return (
    <div className={`velia-pdp ${mode === "kit" ? "kit-mode" : ""}`}>
      <nav className="velia-nav" aria-label="Primary">
        <img src="/velia/logo.svg" alt="Velia" width={66} height={20} />
        <div className="velia-nav-links">
          <span>Shop</span>
          <span>Health features</span>
          <span>Why Velia</span>
          <span>Contacts</span>
        </div>
        <div className="velia-nav-actions">
          <img src="/velia/icon-user.svg" alt="" />
          <img src="/velia/icon-bag.svg" alt="" />
          <span className="velia-choose">Choose your ring</span>
        </div>
      </nav>

      <div className="velia-shell">
        <div className="velia-hero">
          <div className="velia-hero-frame">
            <img src="/velia/hero.png?v=proto-crop-2" alt="Person wearing a silver Velia ring" />
          </div>
        </div>

        <div className="velia-buy-col">
          <div className="velia-buy">
            <h1 className="velia-title">Velia Ring 360°</h1>

            <div>
              <div className="velia-swatches" role="group" aria-label="Color">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`velia-sw ${color === c.id ? "on" : ""}`}
                    aria-pressed={color === c.id}
                    aria-label={c.label}
                    onClick={() => setColor(c.id)}
                  >
                    <i style={{ background: c.fill }} />
                  </button>
                ))}
              </div>
              <div className="velia-color-lbl">
                <span>Color</span>
                <span>・</span>
                <span>{colorLabel}</span>
              </div>
            </div>

            <div className="velia-price">$500</div>

            <div>
              <div className="velia-hsec">Size</div>
              <div className="velia-size-stack">
                <div
                  className="velia-card-know"
                  role="button"
                  tabIndex={0}
                  onClick={() => setMode("know")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setMode("know");
                  }}
                >
                  <div className="velia-rrow">
                    <span className={`velia-radio ${mode === "know" ? "on" : ""}`} />
                    <span className="t">I know my size</span>
                  </div>
                  <div className="velia-know-extra">
                    <div className="velia-chips">
                      {SIZE_CHIPS.map((size) => (
                        <button
                          key={size}
                          type="button"
                          className={`velia-chip ${chip === size ? "on" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMode("know");
                            setChip(size);
                          }}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="velia-btn-outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSizingOpen(true);
                      }}
                    >
                      Measure it online first
                    </button>
                  </div>
                </div>

                <div
                  className="velia-card-kit"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setMode("kit");
                    setChip(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setMode("kit");
                      setChip(null);
                    }
                  }}
                >
                  <div className="velia-rrow" style={{ alignItems: mode === "kit" ? "flex-start" : "center" }}>
                    <span className={`velia-radio ${mode === "kit" ? "on" : ""}`} />
                    <div className="velia-kit-col">
                      <div className="t">Send me a Sizing Kit first</div>
                      <div className="velia-kit-sub">Comes in 6, 8, 10 and 12.</div>
                      <div className="velia-kit-sub velia-kit-more">
                        Try sizers on at home, then order your ring. The kit price is deducted from it with a personal code, valid for one year.
                      </div>
                      <div className="t velia-kit-more">$20</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="velia-hsec">Add Stacking Rings</div>
              <div className="velia-stack-banner">
                <img src="/velia/stack-banner.jpg" alt="" />
                <p>How Stacking Ring works?</p>
              </div>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="velia-stack-item"
                  style={{ width: "100%", marginTop: 4, border: 0, textAlign: "left" }}
                  onClick={() => setStackOn((s) => ({ ...s, [n]: !s[n] }))}
                >
                  <span className="ring-thumb">
                    <img src={`/velia/stack-ring-${n}.png`} alt="" />
                  </span>
                  <span className="nm">
                    <b>Stacking Ring Name</b>
                    <span>More</span>
                  </span>
                  <span className="rb" style={{ boxShadow: stackOn[n] ? "inset 0 0 0 8px #000" : undefined }} />
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="velia-cart"
            disabled={!canCart}
            onClick={() =>
              setToast(
                mode === "kit"
                  ? "Added to cart · Sizing Kit"
                  : `Added to cart · Velia Ring 360°, size ${chip}`,
              )
            }
          >
            Add to Cart
          </button>
        </div>
      </div>

      <div className={`velia-toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>

      {sizingOpen && (
        <SizingModal
          onClose={() => setSizingOpen(false)}
          onComplete={(outcome) => {
            setSizingOpen(false);
            if (outcome.kind === "kit") {
              setMode("kit");
              setChip(null);
              return;
            }
            setMode("know");
            setChip(outcome.us as AvailableUsSize);
          }}
        />
      )}
    </div>
  );
}
