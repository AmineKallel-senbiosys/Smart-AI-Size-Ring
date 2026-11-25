"use client";

import { useEffect, useState } from "react";
import { isMobileDevice } from "@/lib/mobile";

/** A phone or tablet: mobile browser, or a touch screen with a narrow window. */
export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (isMobileDevice()) return true;
  return Boolean(window.matchMedia?.("(pointer: coarse)").matches) && window.innerWidth <= 820;
}

/** false on the server and on the first render, then the real answer (no hydration mismatch). */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(isMobileViewport());
  }, []);
  return mobile;
}
