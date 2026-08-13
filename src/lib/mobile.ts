/** Mobile / iOS helpers for camera + AI tuning. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return isIOS() || /Android/i.test(navigator.userAgent);
}

/** Detection intervals (ms) — keep iOS Safari under memory pressure. */
export function detectionIntervals() {
  const mobile = isMobileDevice();
  const ios = isIOS();
  return {
    handMs: mobile ? 150 : 80,
    cardMs: mobile ? 400 : 220,
    owlMs: mobile ? 1500 : 1000,
    opencvDelayMs: ios ? 0 : mobile ? 2500 : 800,
    frameMaxWidth: mobile ? 480 : 640,
    /** OpenCV live preview — too heavy for iOS; use scanner + OWL instead. */
    liveOpenCv: !ios,
    /** Cheap edge scanner every cardMs tick. */
    liveCardHeuristic: true,
    /** OWL-ViT zero-shot — live on desktop; phones use it once after capture. */
    useOwlLive: !mobile,
  };
}
