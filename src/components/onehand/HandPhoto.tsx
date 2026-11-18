"use client";

import { useEffect, useState } from "react";
import type { FingerKey, HandSide } from "@/lib/onehand/engine";

/**
 * One fixed hand: the two photos are aligned pixel-for-pixel, so switching finger only
 * slides the ring from one finger to the other (a short cross-fade) and the hand never jumps.
 * Fingers without their own photo keep the photo that is already on screen.
 */
type Shot = "index" | "middle";
const SRC: Record<Shot, string> = { index: "/velia/hand-index.jpg", middle: "/velia/hand-middle.jpg" };

export function HandPhoto({ hand, finger }: { hand: HandSide; finger: FingerKey }) {
  const [shown, setShown] = useState<Shot>(finger === "middle" ? "middle" : "index");
  useEffect(() => {
    if (finger === "index" || finger === "middle") setShown(finger);
  }, [finger]);

  return (
    <div className="oh-hand-photo-wrap" style={hand === "right" ? { transform: "scaleX(-1)" } : undefined}>
      {/* the other photo stays underneath; the chosen one fades in on top of it */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="oh-hand-photo" src={SRC[shown === "index" ? "middle" : "index"]} alt="" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={shown} className="oh-hand-photo fade-in" src={SRC[shown]} alt={`Ring on the ${shown} finger`} />
    </div>
  );
}
