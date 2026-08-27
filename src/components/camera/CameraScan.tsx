"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal, flushSync } from "react-dom";
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  mmPerPxFromOutline,
  saveCameraCalibration,
  saveLastResult,
} from "@/lib/calibration";
import {
  diameterToCircumference,
  findNearestByDiameter,
  formatMm,
  formatUsSize,
} from "@/lib/convert";
import {
  detectCardRectAsync,
  detectFingerFromLandmarks,
  detectFingerFromPhoto,
  getHandLandmarker,
  grabVideoFrame,
  smoothCard,
  smoothFinger,
  type DetectedCard,
  type DetectedFinger,
} from "@/lib/detect";
import { useCamera } from "@/hooks/useCamera";
import { CARD_GUIDE } from "@/lib/card-roi";
import { detectionIntervals, isMobileDevice } from "@/lib/mobile";
import { installMediaPipeConsoleFilter } from "@/lib/suppress-mediapipe-console";

installMediaPipeConsoleFilter();

type Step = "intro" | "capture" | "preview" | "align" | "result";
type MeasureMode = "ring" | "finger";

const MIN_DIAM_MM = 12;
const MAX_DIAM_MM = 24;
const DEFAULT_DIAM_MM = 17.3;

export function CameraScan() {
  const { videoRef, status, error, start, stop, capture } = useCamera();
  const [step, setStep] = useState<Step>("intro");
  const [photo, setPhoto] = useState<string | null>(null);
  const [mode, setMode] = useState<MeasureMode>("finger");
  const [aiReady, setAiReady] = useState(false);
  const [opencvReady, setOpencvReady] = useState(false);
  const [aiStatus, setAiStatus] = useState("Tap Open camera to begin");
  const [liveCard, setLiveCard] = useState<DetectedCard | null>(null);
  const [liveFinger, setLiveFinger] = useState<DetectedFinger | null>(null);

  const [card, setCard] = useState({ x: 68, y: 58, w: 42 });
  const [circle, setCircle] = useState({ x: 32, y: 58, d: 14 });
  const [photoAspect, setPhotoAspect] = useState(3 / 4);
  const [portalMounted, setPortalMounted] = useState(false);

  // Capture-quality checks (advisory — the shutter always stays available)
  const [envLum, setEnvLum] = useState<number | null>(null);
  const [distCm, setDistCm] = useState<number | null>(null);
  const [tiltDeg, setTiltDeg] = useState<number | null>(null);
  const [tiltRoll, setTiltRoll] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(320);
  const [stageH, setStageH] = useState(480);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const lastTsRef = useRef(0);
  const lastHandAtRef = useRef(0);
  const lastCardAtRef = useRef(0);
  const lastFingerSeenAtRef = useRef(0);
  const lastCardSeenAtRef = useRef(0);
  const lastOwlAtRef = useRef(0);
  const smoothedCardRef = useRef<DetectedCard | null>(null);
  const smoothedFingerRef = useRef<DetectedFinger | null>(null);
  const intervals = useMemo(() => detectionIntervals(), []);

  const [manualCard, setManualCard] = useState({
    x: CARD_GUIDE.xPct,
    y: CARD_GUIDE.yPct,
    w: CARD_GUIDE.wPct,
  });
  const [owlReady, setOwlReady] = useState(false);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  const isFullscreen =
    step === "capture" || step === "preview" || (step === "align" && !!photo);

  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      setStageW(el.clientWidth || 320);
      setStageH(el.clientHeight || 480);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [step, photo]);

  // The photo is displayed object-cover (same framing as the live camera).
  // Card/circle state stays in PHOTO space; these convert to/from the
  // cover-cropped stage space for rendering and drag interactions.
  const cover = useMemo(() => {
    const dw = Math.max(stageW, stageH * photoAspect);
    const dh = dw / photoAspect;
    return { dw, dh, ox: (stageW - dw) / 2, oy: (stageH - dh) / 2 };
  }, [stageW, stageH, photoAspect]);

  const photoToStage = useCallback(
    (xPct: number, yPct: number, sizePct: number) => ({
      x: ((cover.ox + (xPct / 100) * cover.dw) / stageW) * 100,
      y: ((cover.oy + (yPct / 100) * cover.dh) / stageH) * 100,
      size: (sizePct * cover.dw) / stageW,
    }),
    [cover, stageW, stageH]
  );

  const stageToPhotoXY = useCallback(
    (xStagePct: number, yStagePct: number) => ({
      x: (((xStagePct / 100) * stageW - cover.ox) / cover.dw) * 100,
      y: (((yStagePct / 100) * stageH - cover.oy) / cover.dh) * 100,
    }),
    [cover, stageW, stageH]
  );

  const stageToPhotoSize = useCallback(
    (sizeStagePct: number) => (sizeStagePct * stageW) / cover.dw,
    [cover, stageW]
  );

  // Phone tilt — 0° means the phone is flat, camera looking straight down,
  // i.e. perpendicular to the hand and card on the table.
  useEffect(() => {
    if (step !== "capture") return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      setTiltDeg(Math.round(Math.min(90, Math.hypot(e.beta, e.gamma))));
      // Left–right roll drives the spirit-level line offset (like iOS Camera).
      setTiltRoll(Math.max(-45, Math.min(45, e.gamma)));
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [step]);

  // Load hand model only after camera is live — avoids iOS OOM before getUserMedia.
  useEffect(() => {
    if (status !== "live" || aiReady) return;
    let cancelled = false;
    setAiStatus("Preparing hand tracking…");
    getHandLandmarker()
      .then(() => {
        if (!cancelled) {
          setAiReady(true);
          setAiStatus("Hand ready — loading card AI…");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAiStatus("Hand AI unavailable — you can still capture manually");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status, aiReady]);

  // OWL-ViT zero-shot card model (~80MB download once, runs on-device).
  useEffect(() => {
    if (step !== "capture" || status !== "live" || owlReady) return;
    if (!intervals.useOwlLive) return;
    let cancelled = false;
    setAiStatus("Loading card AI (OWL-ViT)…");
    import("@/lib/card-owl")
      .then((m) => m.preloadCardOwl())
      .then((ok) => {
        if (!cancelled) {
          setOwlReady(ok);
          setAiStatus(
            ok
              ? "Drag card box or wait for AI lock"
              : "Drag card box to match your card"
          );
        }
      })
      .catch(() => {
        if (!cancelled) setAiStatus("Drag card box to match your card");
      });
    return () => {
      cancelled = true;
    };
  }, [step, status, owlReady, intervals.useOwlLive]);

  // Defer OpenCV until camera is live (desktop backup only).
  useEffect(() => {
    if (step !== "capture" || status !== "live" || opencvReady) return;
    if (!intervals.liveOpenCv) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      setAiStatus("Loading card detector…");
      import("@/lib/opencv-card")
        .then((m) => m.preloadOpenCv())
        .then(() => {
          if (!cancelled) {
            setOpencvReady(true);
            setAiStatus("Card AI ready");
          }
        })
        .catch(() => {
          if (!cancelled) setAiStatus("Card AI skipped — manual align after photo");
        });
    }, intervals.opencvDelayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [step, status, opencvReady, intervals.liveOpenCv, intervals.opencvDelayMs]);

  // Throttled detection — never stack concurrent AI frames (iOS crash fix).
  useEffect(() => {
    if (step !== "capture" || status !== "live") return;

    let alive = true;
    smoothedCardRef.current = null;
    smoothedFingerRef.current = null;
    lastFingerSeenAtRef.current = 0;
    lastCardSeenAtRef.current = 0;

    const runDetection = async () => {
      if (!alive || busyRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      busyRef.current = true;
      try {
        const now = performance.now();
        const elW = video.clientWidth || video.getBoundingClientRect().width;
        const elH = video.clientHeight || video.getBoundingClientRect().height;
        const frame = grabVideoFrame(video, intervals.frameMaxWidth);

        let rawFinger: DetectedFinger | null = null;

        if (aiReady && now - lastHandAtRef.current >= intervals.handMs) {
          lastHandAtRef.current = now;
          const landmarker = await getHandLandmarker();
          const ts = now > lastTsRef.current ? now : lastTsRef.current + 1;
          lastTsRef.current = ts;
          const result = landmarker.detectForVideo(video, ts);
          // Reject phantom hands MediaPipe sometimes sees in wood grain etc.
          const handScore = result.handedness?.[0]?.[0]?.score ?? 1;
          if (result.landmarks?.[0] && frame && handScore >= 0.7) {
            lastFingerSeenAtRef.current = now;
            const hit = detectFingerFromLandmarks(
              result.landmarks[0],
              frame.frameW,
              frame.frameH,
              frame.imageData
            );
            rawFinger = smoothFinger(smoothedFingerRef.current, hit, 0.42);
            smoothedFingerRef.current = rawFinger;
          } else {
            // Hand left the frame — drop the stale circle instead of freezing it
            if (now - lastFingerSeenAtRef.current > 700) {
              smoothedFingerRef.current = null;
            }
            rawFinger = smoothedFingerRef.current;
          }
        } else {
          rawFinger = smoothedFingerRef.current;
        }

        const cardDue =
          !!frame && now - lastCardAtRef.current >= intervals.cardMs;
        const owlDue =
          !!frame &&
          intervals.useOwlLive &&
          owlReady &&
          now - lastOwlAtRef.current >= intervals.owlMs;

        if (frame && intervals.liveCardHeuristic && (cardDue || owlDue)) {
          if (cardDue) lastCardAtRef.current = now;
          if (owlDue) lastOwlAtRef.current = now;

          const exclude = rawFinger
            ? { xPct: rawFinger.xPct, yPct: rawFinger.yPct, rPct: 14 }
            : null;
          const useOpenCv = intervals.liveOpenCv && opencvReady;
          const hit = await detectCardRectAsync(frame.imageData, exclude, {
            lite: isMobileDevice(),
            heuristicOnly: !useOpenCv,
            scannerOnly: !owlDue,
            relaxed: true,
            useOwl: owlDue,
          });
          if (hit) {
            lastCardSeenAtRef.current = now;
            smoothedCardRef.current = smoothCard(
              smoothedCardRef.current,
              hit,
              0.55
            );
          } else if (now - lastCardSeenAtRef.current > 1600) {
            // Card left the frame — clear it so the check goes orange
            smoothedCardRef.current = null;
          }
        }

        const rawCard = smoothedCardRef.current;

        // Scene brightness (0-255), sampled sparsely from the analysis frame.
        let lum: number | null = null;
        if (frame) {
          const px = frame.imageData.data;
          let sum = 0;
          let n = 0;
          for (let i = 0; i < px.length; i += 96) {
            sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            n++;
          }
          if (n > 0) lum = Math.round(sum / n);
        }

        // Camera→scene distance estimated from the card's apparent width
        // (a credit card is 85.6mm wide; pinhole model with typical phone FOV).
        let dist: number | null = null;
        if (rawCard && frame) {
          const frac = rawCard.wPct / 100;
          if (frac > 0.02) {
            const fovDeg = frame.frameW < frame.frameH ? 53 : 66;
            const halfFov = ((fovDeg / 2) * Math.PI) / 180;
            dist = Math.round(
              CARD_WIDTH_MM / (2 * frac * Math.tan(halfFov)) / 10
            );
          }
        }

        const finger = rawFinger
          ? mapToOverlay(
              rawFinger.xPct,
              rawFinger.yPct,
              rawFinger.dPct,
              "circle",
              video.videoWidth,
              video.videoHeight,
              elW,
              elH
            )
          : null;

        const cardHit = rawCard
          ? mapToOverlay(
              rawCard.xPct,
              rawCard.yPct,
              rawCard.wPct,
              "card",
              video.videoWidth,
              video.videoHeight,
              elW,
              elH
            )
          : null;

        if (!alive) return;

        setEnvLum(lum);
        setDistCm(dist);
        setLiveCard(
          cardHit
            ? {
                xPct: cardHit.xPct,
                yPct: cardHit.yPct,
                wPct: cardHit.sizePct,
                score: rawCard!.score,
              }
            : null
        );
        setLiveFinger(
          finger
            ? {
                xPct: finger.xPct,
                yPct: finger.yPct,
                dPct: finger.sizePct,
                landmarkIndex: rawFinger!.landmarkIndex,
                confidence: rawFinger!.confidence,
              }
            : null
        );

        const fingerLocked =
          rawFinger != null && rawFinger.confidence >= 0.45;

        setAiStatus(
          fingerLocked && rawCard
            ? "Locked — card + finger"
            : fingerLocked
              ? "Finger locked — card on the RIGHT"
              : rawFinger
                ? "Open hand flat — align ring finger"
                : rawCard
                  ? "Card locked — show ring finger"
                  : status === "live"
                    ? opencvReady || intervals.liveCardHeuristic
                      ? "Finger LEFT · card RIGHT"
                      : "Camera live — loading card AI…"
                    : "Starting camera…"
        );
      } catch {
        /* skip frame */
      } finally {
        busyRef.current = false;
      }
    };

    const tickMs = isMobileDevice() ? 180 : 100;
    detectTimerRef.current = setInterval(() => void runDetection(), tickMs);

    return () => {
      alive = false;
      if (detectTimerRef.current) clearInterval(detectTimerRef.current);
    };
  }, [
    step,
    status,
    aiReady,
    opencvReady,
    videoRef,
    intervals.handMs,
    intervals.cardMs,
    intervals.frameMaxWidth,
    intervals.liveOpenCv,
    intervals.liveCardHeuristic,
    intervals.useOwlLive,
    intervals.owlMs,
    owlReady,
  ]);

  const cardPx = (card.w / 100) * stageW;
  const diameterPx = (circle.d / 100) * stageW;

  const mmPerPx = useMemo(
    () => mmPerPxFromOutline(cardPx, CARD_WIDTH_MM),
    [cardPx]
  );

  const diameterMm = useMemo(() => {
    if (cardPx <= 0) return DEFAULT_DIAM_MM;
    const raw = diameterPx * mmPerPx;
    return Math.min(MAX_DIAM_MM, Math.max(MIN_DIAM_MM, +raw.toFixed(2)));
  }, [diameterPx, mmPerPx, cardPx]);

  const circumferenceMm = useMemo(
    () => diameterToCircumference(diameterMm),
    [diameterMm]
  );

  const converted = useMemo(
    () => findNearestByDiameter(diameterMm),
    [diameterMm]
  );

  const openCamera = useCallback(() => {
    setLiveCard(null);
    setLiveFinger(null);
    setOpencvReady(false);
    setOwlReady(false);
    setAiReady(false);
    setManualCard({
      x: CARD_GUIDE.xPct,
      y: CARD_GUIDE.yPct,
      w: CARD_GUIDE.wPct,
    });
    smoothedCardRef.current = null;
    smoothedFingerRef.current = null;
    setEnvLum(null);
    setDistCm(null);
    setTiltDeg(null);
    setTiltRoll(0);
    setAiStatus("Opening camera…");

    // iOS 13+ requires a user-gesture permission request for tilt sensors.
    const doe = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof doe?.requestPermission === "function") {
      doe.requestPermission().catch(() => {});
    }

    if (step !== "capture") {
      flushSync(() => setStep("capture"));
    }
    // Must call getUserMedia in the same user-gesture turn — setTimeout breaks iOS Safari.
    void start();
  }, [step, start]);

  const takePhoto = async () => {
    const video = videoRef.current;
    const data = capture();
    if (!data) return;

    // Stage will letterbox the photo at this exact aspect so photo % == stage %
    if (video?.videoWidth && video.videoHeight) {
      setPhotoAspect(video.videoWidth / video.videoHeight);
    }

    setAiStatus("Measuring photo…");
    // Free camera memory BEFORE heavy OWL inference (critical on iPhone).
    stop();

    // IMPORTANT: seeds must be in PHOTO space (raw frame %), never the
    // screen-mapped live boxes — mixing spaces made overlays jump after snap.
    let cardSeed: DetectedCard | null =
      smoothedCardRef.current ??
      ({
        xPct: manualCard.x,
        yPct: manualCard.y,
        wPct: manualCard.w,
        score: 0,
      } as DetectedCard);
    let fingerSeed: DetectedFinger | null = smoothedFingerRef.current;

    const [cardHit, fingerHit] = await Promise.all([
      detectCardFromPhoto(data).catch(() => null),
      detectFingerFromPhoto(data).catch(() => null),
    ]);
    if (cardHit) cardSeed = cardHit;
    if (fingerHit) fingerSeed = fingerHit;

    setPhoto(data);

    if (cardSeed) {
      setCard({
        x: cardSeed.xPct,
        y: cardSeed.yPct,
        w: clamp(cardSeed.wPct, 18, 70),
      });
    } else {
      setCard({ x: 68, y: 58, w: 42 });
    }

    if (fingerSeed) {
      setCircle({
        x: fingerSeed.xPct,
        y: fingerSeed.yPct,
        d: clamp(fingerSeed.dPct, 5, 18),
      });
    } else {
      const baseW = cardSeed?.wPct ?? 42;
      const dPct = baseW * (DEFAULT_DIAM_MM / CARD_WIDTH_MM);
      setCircle({ x: 32, y: 58, d: clamp(dPct, 6, 16) });
    }

    setStep("preview");
  };

  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }, []);

  useEffect(
    () => () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    },
    []
  );

  // 3-2-1 countdown so the user holds the phone still before capture.
  const startCountdown = () => {
    if (countdownRef.current || status !== "live") return;
    let n = 3;
    setCountdown(n);
    countdownRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        setCountdown(null);
        void takePhoto();
      } else {
        setCountdown(n);
      }
    }, 1000);
  };

  const finish = () => {
    saveCameraCalibration({
      mmPerPx,
      objectId: "credit-card",
      scale: card.w / 42,
      savedAt: Date.now(),
    });
    saveLastResult({
      diameterMm,
      circumferenceMm,
      mode,
      method: "camera",
      savedAt: Date.now(),
    });
    setStep("result");
  };

  const restart = () => {
    cancelCountdown();
    stop();
    setOpencvReady(false);
    setOwlReady(false);
    setAiReady(false);
    setManualCard({
      x: CARD_GUIDE.xPct,
      y: CARD_GUIDE.yPct,
      w: CARD_GUIDE.wPct,
    });
    setPhoto(null);
    setLiveCard(null);
    setLiveFinger(null);
    setCard({ x: 68, y: 58, w: 42 });
    setCircle({ x: 32, y: 58, d: 14 });
    setStep("intro");
  };

  // Capture-quality rules — shutter needs finger + lighting/distance.
  // Card box is ALWAYS available (AI lock or user-dragged "DRAG CARD" overlay).
  const cardOk = true;
  const fingerOk = Boolean(liveFinger && liveFinger.confidence >= 0.45);
  const lightOk = envLum != null && envLum >= 70 && envLum <= 245;
  const distOk = distCm != null && distCm >= 20 && distCm <= 35;
  const angleOk = tiltDeg != null && tiltDeg <= 15;
  const allChecksOk =
    cardOk && fingerOk && lightOk && distOk && (tiltDeg == null || angleOk);

  const captureHint =
    status !== "live"
      ? aiStatus
      : envLum != null && !lightOk
        ? envLum < 70
          ? "Too dark — add more light"
          : "Too bright — reduce glare"
        : cardOk && distCm != null && !distOk
          ? distCm > 35
            ? `Too far (~${distCm} cm) — move to 25–30 cm`
            : `Too close (~${distCm} cm) — move to 25–30 cm`
          : tiltDeg != null && !angleOk
            ? "Hold the phone flat — look straight down"
            : aiStatus;

  const fullscreenPortal =
    portalMounted && isFullscreen
      ? createPortal(
          <div className="camera-fullscreen fixed inset-0 z-[200] flex flex-col bg-black">
            {step === "capture" && (
              <>
                <div className="relative min-h-0 flex-1">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {(status === "requesting" || status === "idle") && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black text-sm text-white/70">
                      Starting camera…
                    </div>
                  )}
                  {(status === "denied" ||
                    status === "unsupported" ||
                    status === "error") && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-8 text-center">
                      <p className="text-sm leading-relaxed text-white/90">
                        {error}
                      </p>
                      <button
                        type="button"
                        onClick={openCamera}
                        className="rounded-full border border-white/30 px-5 py-2.5 text-sm text-white"
                      >
                        Try again
                      </button>
                      <Link
                        href="/sizer"
                        className="text-sm text-[var(--accent-glow)]"
                      >
                        Use screen sizer
                      </Link>
                    </div>
                  )}

                  {status === "live" && (
                    <>
                      <div className="pointer-events-none absolute inset-0">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.35)_100%)]" />
                        <LevelCalibrationLine
                          tiltDeg={tiltDeg}
                          rollDeg={tiltRoll}
                        />
                        {!liveFinger && (
                          <div className="absolute bottom-[22%] left-[8%] w-[32%] opacity-50">
                            <FingerGuideGhost />
                          </div>
                        )}
                        {liveFinger && <LiveFingerBox finger={liveFinger} />}
                      </div>
                      <LiveDraggableCardBox
                        card={
                          liveCard ?? {
                            xPct: manualCard.x,
                            yPct: manualCard.y,
                            wPct: manualCard.w,
                            score: 0,
                          }
                        }
                        aiLocked={!!liveCard}
                        onChange={(x, y, w) => {
                          setLiveCard(null);
                          smoothedCardRef.current = null;
                          setManualCard({ x, y, w });
                        }}
                      />
                    </>
                  )}

                  {countdown != null && (
                    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/25">
                      <p
                        key={countdown}
                        className="animate-[ping_0.9s_ease-out_1] font-[family-name:var(--font-display)] text-[110px] font-bold leading-none text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)]"
                      >
                        {countdown}
                      </p>
                      <p className="mt-4 rounded-full bg-black/60 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm">
                        Hold still — don&apos;t move your phone
                      </p>
                    </div>
                  )}

                  <div className="camera-safe-top absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-3">
                    <button
                      type="button"
                      onClick={restart}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-xl text-white backdrop-blur-sm"
                      aria-label="Close camera"
                    >
                      ×
                    </button>
                    {status === "live" && (
                      <p className="max-w-[58%] truncate rounded-full bg-black/45 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur-sm">
                        {captureHint}
                      </p>
                    )}
                    <span className="w-10" aria-hidden />
                  </div>
                </div>

                <div className="camera-safe-bottom relative z-10 shrink-0 bg-gradient-to-t from-black via-black/80 to-transparent px-6 pb-4 pt-6">
                  {status === "live" && (
                    <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5">
                      <CheckChip ok={cardOk} label="Card box" />
                      <CheckChip ok={fingerOk} label="Finger" />
                      <CheckChip
                        ok={lightOk}
                        pending={envLum == null}
                        label="Light"
                      />
                      <CheckChip
                        ok={distOk}
                        pending={distCm == null}
                        label={distCm != null ? `~${distCm} cm` : "25–30 cm"}
                      />
                      <CheckChip
                        ok={angleOk}
                        pending={tiltDeg == null}
                        label={tiltDeg != null ? `Flat ${tiltDeg}°` : "Flat"}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      disabled={
                        status !== "live" || countdown != null || !allChecksOk
                      }
                      onClick={startCountdown}
                      className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[4px] border-white disabled:opacity-35"
                      aria-label="Capture photo"
                    >
                      <span
                        className={`h-[62px] w-[62px] rounded-full transition-colors ${
                          allChecksOk ? "bg-[var(--accent-glow)]" : "bg-white"
                        }`}
                      />
                    </button>
                  </div>
                  <p className="mono mt-3 text-center text-[10px] tracking-wider text-white/55">
                    {countdown != null
                      ? "HOLD STILL…"
                        : allChecksOk
                        ? "READY — TAP TO CAPTURE"
                        : !fingerOk
                          ? "SHOW RING FINGER · DRAG CARD BOX"
                          : "COMPLETE CHECKS TO CAPTURE"}
                  </p>
                </div>
              </>
            )}

            {(step === "preview" || step === "align") && photo && (
              <>
                <div className="relative min-h-0 flex-1">
                  {/* Photo fills the screen exactly like the live camera view.
                      Overlay state lives in photo space and is converted through
                      the object-cover transform, so nothing jumps or distorts. */}
                  <div
                    ref={stageRef}
                    className="absolute inset-0 touch-none select-none overflow-hidden"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt="Captured sizing photo"
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      draggable={false}
                    />
                    <CardOverlay
                      xPct={photoToStage(card.x, card.y, card.w).x}
                      yPct={photoToStage(card.x, card.y, card.w).y}
                      wPct={photoToStage(card.x, card.y, card.w).size}
                      onMove={(x, y) =>
                        setCard((c) => ({ ...c, ...stageToPhotoXY(x, y) }))
                      }
                      onResize={(w) =>
                        setCard((c) => ({ ...c, w: stageToPhotoSize(w) }))
                      }
                    />
                    <CircleOverlay
                      xPct={photoToStage(circle.x, circle.y, circle.d).x}
                      yPct={photoToStage(circle.x, circle.y, circle.d).y}
                      dPct={photoToStage(circle.x, circle.y, circle.d).size}
                      onMove={(x, y) =>
                        setCircle((c) => ({ ...c, ...stageToPhotoXY(x, y) }))
                      }
                      onResize={(d) =>
                        setCircle((c) => ({ ...c, d: stageToPhotoSize(d) }))
                      }
                    />
                  </div>

                  <div className="camera-safe-top absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPhoto(null);
                        openCamera();
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-xl text-white backdrop-blur-sm"
                      aria-label="Retake photo"
                    >
                      ×
                    </button>
                    <p className="rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                      {step === "preview" ? "Your measure" : "Fine-tune"}
                    </p>
                    <span className="w-10" aria-hidden />
                  </div>
                </div>

                <div className="camera-safe-bottom relative z-20 shrink-0 bg-gradient-to-t from-black via-black/90 to-transparent px-4 pb-4 pt-5">
                  {step === "preview" ? (
                    <>
                      <div className="rounded-2xl border border-white/15 bg-black/55 px-5 py-4 backdrop-blur-md">
                        <p className="mono-label text-[var(--gold-light)]">
                          Circumference
                        </p>
                        <p className="mt-1 font-[family-name:var(--font-display)] text-5xl font-bold leading-none text-[var(--gold-light)]">
                          {formatMm(circumferenceMm)}
                          <span className="ml-2 text-2xl font-normal text-white/70">
                            mm
                          </span>
                        </p>
                        <p className="mono mt-3 text-center text-[11px] text-white/50">
                          Ø diameter {formatMm(diameterMm, 2)} mm
                        </p>
                        <div className="mt-3 grid grid-cols-4 gap-2">
                          {[
                            { l: "US", v: formatUsSize(converted.row.us) },
                            { l: "UK", v: converted.row.uk },
                            {
                              l: "EU",
                              v:
                                converted.row.eu != null
                                  ? String(converted.row.eu)
                                  : "—",
                            },
                            {
                              l: "JP",
                              v:
                                converted.row.jp != null
                                  ? String(converted.row.jp)
                                  : "—",
                            },
                          ].map((c) => (
                            <div
                              key={c.l}
                              className="rounded-lg bg-white/10 px-2 py-2 text-center"
                            >
                              <p className="mono-label text-[9px] text-white/45">
                                {c.l}
                              </p>
                              <p className="mt-0.5 text-sm font-semibold text-white">
                                {c.v}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 flex gap-3">
                        <button
                          type="button"
                          onClick={() => setStep("align")}
                          className="flex-1 rounded-xl border border-white/25 bg-white/10 py-3 text-sm font-medium text-white backdrop-blur-sm"
                        >
                          Fine-tune
                        </button>
                        <button
                          type="button"
                          onClick={finish}
                          className="gold-fill flex-1 rounded-xl py-3 text-sm font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
                        >
                          Save size
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mb-3 grid grid-cols-2 gap-3">
                        <div>
                          <label className="mono-label text-white/55">
                            Card width
                          </label>
                          <input
                            type="range"
                            min={18}
                            max={70}
                            step={0.2}
                            value={card.w}
                            onChange={(e) =>
                              setCard((c) => ({ ...c, w: +e.target.value }))
                            }
                            className="mt-2 h-4 w-full"
                          />
                        </div>
                        <div>
                          <label className="mono-label text-white/55">
                            {mode === "ring" ? "Ring hole" : "Finger width"}
                          </label>
                          <input
                            type="range"
                            min={5}
                            max={20}
                            step={0.1}
                            value={circle.d}
                            onChange={(e) =>
                              setCircle((c) => ({ ...c, d: +e.target.value }))
                            }
                            className="mt-2 h-4 w-full"
                          />
                        </div>
                      </div>
                      <div className="flex items-end justify-between rounded-xl border border-white/15 bg-black/55 px-4 py-3 backdrop-blur-md">
                        <div>
                          <p className="mono-label text-[var(--gold-light)]">
                            Circumference
                          </p>
                          <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-[var(--gold-light)]">
                            {formatMm(circumferenceMm)}
                            <span className="ml-1.5 text-base font-normal text-white/70">
                              mm
                            </span>
                          </p>
                        </div>
                        <p className="mono text-right text-[10px] text-white/45">
                          Ø {formatMm(diameterMm, 2)} mm
                          <br />
                          US {formatUsSize(converted.row.us)}
                        </p>
                      </div>
                      <div className="mt-4 flex gap-3">
                        <button
                          type="button"
                          onClick={() => setStep("preview")}
                          className="flex-1 rounded-xl border border-white/25 bg-white/10 py-3 text-sm text-white"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={finish}
                          className="gold-fill flex-1 rounded-xl py-3 text-sm font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
                        >
                          Save size
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {fullscreenPortal}
      <div
        className={`mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-lg flex-col px-4 py-4 sm:py-6 ${
          isFullscreen ? "invisible h-0 overflow-hidden p-0" : ""
        }`}
      >
      <StepDots step={step} />

      <AnimatePresence mode="wait">
        {step === "intro" && (
          <Panel key="intro">
            <Badge>AI camera · Card scale</Badge>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight tracking-tight text-[var(--ink)]">
              Hand left. Card right.
              <span className="mt-1 block text-[var(--gold-deep)]">
                AI finds both live.
              </span>
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
              On-device hand model + card edge detection. Nothing is uploaded.
              Snap when the teal boxes lock onto your finger and card.
            </p>

            <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--stage)] p-5">
              <CaptureGuide staticPreview />
            </div>

            <ol className="mt-6 space-y-3">
              {[
                "Flat table · phone parallel · even light",
                "Ring finger on the LEFT · bank card on the RIGHT",
                "Wait for AI lock, then capture — your size appears instantly",
              ].map((t, i) => (
                <li
                  key={t}
                  className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3"
                >
                  <span className="mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--gold-soft)] text-xs font-medium text-[var(--gold-deep)]">
                    {i + 1}
                  </span>
                  <span className="text-sm text-[var(--ink)]">{t}</span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={openCamera}
              className="gold-fill mt-8 w-full rounded-xl px-5 py-3.5 text-[15px] font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_12px_28px_-14px_rgba(184,147,74,0.55)]"
            >
              Open camera
            </button>
            <p className="mono mt-3 text-center text-[11px] text-[var(--muted)]">
              {aiStatus}
            </p>
            <Link
              href="/sizer"
              className="mt-3 block text-center text-sm text-[var(--muted)] underline-offset-4 hover:underline"
            >
              Prefer screen sizer instead?
            </Link>
          </Panel>
        )}

        {step === "result" && (
          <Panel key="result">
            <Badge>Measurement</Badge>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold">
              Your circumference
            </h2>
            <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-8 text-center">
              <p className="mono-label text-[var(--gold-deep)]">Circumference</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-6xl text-[var(--gold-light)]">
                {formatMm(circumferenceMm)}
                <span className="ml-2 text-2xl text-[var(--muted)]">mm</span>
              </p>
              <p className="mono mt-3 text-[11px] text-[var(--muted)]">
                Ø diameter {formatMm(diameterMm, 2)} mm
              </p>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { l: "US", v: formatUsSize(converted.row.us) },
                { l: "UK", v: converted.row.uk },
                {
                  l: "EU",
                  v: converted.row.eu != null ? String(converted.row.eu) : "—",
                },
                {
                  l: "JP",
                  v: converted.row.jp != null ? String(converted.row.jp) : "—",
                },
              ].map((c) => (
                <div
                  key={c.l}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-center"
                >
                  <p className="mono-label text-[var(--muted)]">{c.l}</p>
                  <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-bold">
                    {c.v}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setStep(photo ? "preview" : "align")}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
              >
                Adjust
              </button>
              <button
                type="button"
                onClick={restart}
                className="gold-fill flex-1 rounded-xl px-4 py-3 text-sm font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
              >
                Scan again
              </button>
            </div>
          </Panel>
        )}
      </AnimatePresence>
      </div>
    </>
  );
}

function FingerGuideGhost() {
  return (
    <>
      <svg viewBox="0 0 80 160" className="guide-pulse w-full opacity-95" aria-hidden>
        <path
          d="M28 158 V72 C28 52 22 40 22 28 C22 16 30 8 40 8 C50 8 58 16 58 28 C58 40 52 52 52 72 V158"
          fill="none"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth="2.5"
          strokeDasharray="5 4"
          strokeLinecap="round"
        />
        <ellipse
          cx="40"
          cy="112"
          rx="13"
          ry="6"
          fill="none"
          stroke="var(--accent-glow)"
          strokeWidth="2"
        />
      </svg>
      <p className="mono mt-1 text-center text-[10px] tracking-wider text-white/85">
        FINGER
      </p>
    </>
  );
}

function CardGuideGhost() {
  return (
    <>
      <div
        className="guide-pulse w-full rounded-[6px] border-2 border-dashed border-[var(--accent-glow)] bg-[var(--accent)]/20"
        style={{ aspectRatio: `${CARD_WIDTH_MM} / ${CARD_HEIGHT_MM}` }}
      />
      <p className="mono mt-1 text-center text-[10px] tracking-wider text-[var(--accent-glow)]">
        CARD
      </p>
    </>
  );
}

/** Finger LEFT · Card RIGHT — intro preview */
function CaptureGuide({ staticPreview = false }: { staticPreview?: boolean }) {
  return (
    <div
      className={`relative flex h-full w-full items-end justify-center gap-3 pb-2 ${
        staticPreview ? "min-h-[160px]" : ""
      }`}
    >
      <div className="relative mb-1 flex w-[36%] flex-col items-center">
        <svg
          viewBox="0 0 80 160"
          className={`w-full ${staticPreview ? "opacity-90" : "guide-pulse opacity-95"}`}
          aria-hidden
        >
          <path
            d="M28 158 V72 C28 52 22 40 22 28 C22 16 30 8 40 8 C50 8 58 16 58 28 C58 40 52 52 52 72 V158"
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="2.5"
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
          <ellipse
            cx="40"
            cy="112"
            rx="13"
            ry="6"
            fill="none"
            stroke="var(--accent-glow)"
            strokeWidth="2"
          />
        </svg>
        <p className="mono absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] tracking-wider text-white/85">
          FINGER
        </p>
      </div>

      <div className="relative w-[46%]">
        <div
          className={`w-full rounded-[6px] border-2 border-dashed border-[var(--accent-glow)] bg-[var(--accent)]/15 ${
            staticPreview ? "" : "guide-pulse"
          }`}
          style={{ aspectRatio: `${CARD_WIDTH_MM} / ${CARD_HEIGHT_MM}` }}
        />
        <p className="mono absolute -top-5 left-0 text-[10px] tracking-wider text-[var(--accent-glow)]">
          CARD
        </p>
      </div>
    </div>
  );
}

/**
 * Apple Camera-style spirit level.
 * Two fixed white side dashes + a center segment that rotates with roll.
 * Within ~2.5° everything merges into one yellow line, then fades away.
 */
function LevelCalibrationLine({
  tiltDeg,
  rollDeg,
}: {
  tiltDeg: number | null;
  rollDeg: number;
}) {
  const leveled = tiltDeg != null && Math.abs(rollDeg) <= 2.5;
  const [faded, setFaded] = useState(false);

  // Fade the line out ~0.8s after leveling (like iOS), reappear on tilt.
  useEffect(() => {
    if (!leveled) {
      setFaded(false);
      return;
    }
    const t = setTimeout(() => setFaded(true), 800);
    return () => clearTimeout(t);
  }, [leveled]);

  if (tiltDeg == null) return null;

  const rotate = leveled ? 0 : Math.max(-30, Math.min(30, -rollDeg));
  const white = "rgba(255,255,255,0.9)";
  const yellow = "#ffcc00";
  const color = leveled ? yellow : white;

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 z-[6] h-6 w-[176px] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-500"
      style={{ opacity: faded ? 0 : 1 }}
      aria-hidden
    >
      {/* Left dash (fixed) */}
      <span
        className="absolute left-0 top-1/2 h-[1.5px] w-[30px] -translate-y-1/2 transition-colors duration-150"
        style={{
          background: color,
          boxShadow: "0 0 3px rgba(0,0,0,0.5)",
        }}
      />
      {/* Right dash (fixed) */}
      <span
        className="absolute right-0 top-1/2 h-[1.5px] w-[30px] -translate-y-1/2 transition-colors duration-150"
        style={{
          background: color,
          boxShadow: "0 0 3px rgba(0,0,0,0.5)",
        }}
      />
      {/* Center segment — rotates with roll, snaps yellow when level */}
      <span
        className="absolute left-1/2 top-1/2 h-[1.5px] w-[92px] transition-colors duration-150"
        style={{
          background: color,
          boxShadow: "0 0 3px rgba(0,0,0,0.5)",
          transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
        }}
      />
    </div>
  );
}

function CheckChip({
  ok,
  pending = false,
  label,
}: {
  ok: boolean;
  pending?: boolean;
  label: string;
}) {
  const dot = pending
    ? "bg-white/40"
    : ok
      ? "bg-[var(--accent-glow)]"
      : "bg-orange-500";
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-medium text-white/85 backdrop-blur-sm">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function LiveFingerBox({ finger }: { finger: DetectedFinger }) {
  const ok = finger.confidence >= 0.45;
  const border = ok ? "var(--accent-glow)" : "#ef4444";

  return (
    <div
      className="absolute rounded-full border-[2.5px] transition-[left,top,width,height,border-color] duration-100"
      style={{
        left: `${finger.xPct}%`,
        top: `${finger.yPct}%`,
        width: `${finger.dPct}%`,
        aspectRatio: "1",
        transform: "translate(-50%, -50%)",
        borderColor: border,
        boxShadow: ok
          ? "0 0 0 9999px rgba(0,0,0,0.12)"
          : "0 0 0 9999px rgba(239,68,68,0.18)",
      }}
    >
      <span
        className="mono absolute -top-5 left-1/2 -translate-x-1/2 text-[10px]"
        style={{ color: border }}
      >
        {ok ? "RING" : "ALIGN"}
      </span>
    </div>
  );
}

function LiveDraggableCardBox({
  card,
  aiLocked,
  onChange,
}: {
  card: DetectedCard;
  aiLocked: boolean;
  onChange: (x: number, y: number, w: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useDragPct(
    (x, y) => onChange(x, y, card.wPct),
    (w) => onChange(card.xPct, card.yPct, w)
  );

  return (
    <div
      ref={ref}
      className={`absolute z-[5] touch-none ${
        aiLocked ? "pointer-events-none" : "pointer-events-auto"
      }`}
      style={{
        left: `${card.xPct}%`,
        top: `${card.yPct}%`,
        width: `${card.wPct}%`,
        aspectRatio: `${CARD_WIDTH_MM} / ${CARD_HEIGHT_MM}`,
        transform: "translate(-50%, -50%)",
      }}
      onPointerMove={(e) =>
        drag.onPointerMove(e, ref.current?.parentElement ?? null)
      }
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerUp}
    >
      <div
        className={`relative h-full w-full rounded-md border-[2.5px] border-dashed bg-[var(--accent)]/25 ${
          aiLocked
            ? "border-white/90"
            : "border-[var(--accent-glow)] guide-pulse"
        }`}
      >
        <span className="mono absolute left-1.5 top-1 text-[10px] text-white drop-shadow">
          {aiLocked ? "CARD ✓" : "DRAG CARD"}
        </span>
        {!aiLocked && (
          <div
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            onPointerDown={(e) =>
              drag.onPointerDownMove(e, card.xPct, card.yPct)
            }
          />
        )}
        {!aiLocked && (
          <button
            type="button"
            aria-label="Resize card box"
            className="absolute -bottom-2 -right-2 z-10 h-7 w-7 rounded-full border-2 border-[var(--accent-glow)] bg-white shadow"
            onPointerDown={(e) =>
              drag.onPointerDownResize(e, card.wPct, card.xPct, card.yPct)
            }
          />
        )}
      </div>
    </div>
  );
}

function LiveCardBox({ card }: { card: DetectedCard }) {
  return (
    <div
      className="absolute rounded-md border-[2.5px] border-dashed border-white/90 bg-[var(--accent)]/20 transition-[left,top,width] duration-150"
      style={{
        left: `${card.xPct}%`,
        top: `${card.yPct}%`,
        width: `${card.wPct}%`,
        aspectRatio: `${CARD_WIDTH_MM} / ${CARD_HEIGHT_MM}`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <span className="mono absolute left-1.5 top-1 text-[10px] text-white">
        CARD
      </span>
    </div>
  );
}

/**
 * Map normalized video-frame coords (%) into the object-cover CSS overlay box.
 */
function mapToOverlay(
  xPct: number,
  yPct: number,
  sizePct: number,
  kind: "circle" | "card",
  vw: number,
  vh: number,
  elW: number,
  elH: number
): { xPct: number; yPct: number; sizePct: number } {
  if (!vw || !vh || !elW || !elH || elW < 8 || elH < 8) {
    return { xPct, yPct, sizePct };
  }

  const scale = Math.max(elW / vw, elH / vh);
  const dispW = vw * scale;
  const dispH = vh * scale;
  const ox = (dispW - elW) / 2;
  const oy = (dispH - elH) / 2;

  const px = (xPct / 100) * dispW - ox;
  const py = (yPct / 100) * dispH - oy;
  const sizePx = (sizePct / 100) * vw * scale;

  return {
    xPct: clamp((px / elW) * 100, 0, 100),
    yPct: clamp((py / elH) * 100, 0, 100),
    sizePct: clamp(
      (sizePx / elW) * 100,
      kind === "circle" ? 5 : 14,
      kind === "circle" ? 20 : 78
    ),
  };
}

function useDragPct(
  onMove: (xPct: number, yPct: number) => void,
  onResize?: (sizePct: number, from: "corner") => void
) {
  const dragging = useRef<"move" | "resize" | null>(null);
  const start = useRef({ x: 0, y: 0, ox: 0, oy: 0, size: 0 });

  const onPointerDownMove = useCallback(
    (e: ReactPointerEvent, xPct: number, yPct: number) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = "move";
      start.current = { x: e.clientX, y: e.clientY, ox: xPct, oy: yPct, size: 0 };
    },
    []
  );

  const onPointerDownResize = useCallback(
    (e: ReactPointerEvent, sizePct: number, xPct: number, yPct: number) => {
      if (!onResize) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = "resize";
      start.current = {
        x: e.clientX,
        y: e.clientY,
        ox: xPct,
        oy: yPct,
        size: sizePct,
      };
    },
    [onResize]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent, parent: HTMLElement | null) => {
      if (!dragging.current || !parent) return;
      const rect = parent.getBoundingClientRect();
      if (dragging.current === "move") {
        const dx = ((e.clientX - start.current.x) / rect.width) * 100;
        const dy = ((e.clientY - start.current.y) / rect.height) * 100;
        onMove(
          clamp(start.current.ox + dx, 8, 92),
          clamp(start.current.oy + dy, 8, 92)
        );
      } else if (dragging.current === "resize" && onResize) {
        const dx = ((e.clientX - start.current.x) / rect.width) * 100;
        onResize(clamp(start.current.size + dx, 6, 75), "corner");
      }
    },
    [onMove, onResize]
  );

  const onPointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  return { onPointerDownMove, onPointerDownResize, onPointerMove, onPointerUp };
}

function CardOverlay({
  xPct,
  yPct,
  wPct,
  onMove,
  onResize,
}: {
  xPct: number;
  yPct: number;
  wPct: number;
  onMove: (x: number, y: number) => void;
  onResize: (w: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useDragPct(onMove, (w) => onResize(w));

  return (
    <div
      ref={ref}
      className="absolute z-10"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        width: `${wPct}%`,
        aspectRatio: `${CARD_WIDTH_MM} / ${CARD_HEIGHT_MM}`,
        transform: "translate(-50%, -50%)",
      }}
      onPointerMove={(e) =>
        drag.onPointerMove(e, ref.current?.parentElement ?? null)
      }
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerUp}
    >
      <div
        className="absolute inset-0 cursor-grab rounded-[5px] border-[2.5px] border-[var(--accent-glow)] bg-[var(--accent)]/20 active:cursor-grabbing"
        onPointerDown={(e) => drag.onPointerDownMove(e, xPct, yPct)}
      >
        <span className="mono absolute left-1.5 top-1 text-[9px] text-[var(--accent-glow)]">
          CARD {CARD_WIDTH_MM} mm
        </span>
      </div>
      <button
        type="button"
        aria-label="Resize card"
        className="absolute -bottom-2 -right-2 z-20 h-6 w-6 rounded-full border-2 border-white bg-[var(--accent)] shadow"
        onPointerDown={(e) => drag.onPointerDownResize(e, wPct, xPct, yPct)}
      />
    </div>
  );
}

function CircleOverlay({
  xPct,
  yPct,
  dPct,
  onMove,
  onResize,
}: {
  xPct: number;
  yPct: number;
  dPct: number;
  onMove: (x: number, y: number) => void;
  onResize: (d: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useDragPct(onMove, (d) => onResize(d));

  return (
    <div
      ref={ref}
      className="absolute z-20"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        width: `${dPct}%`,
        aspectRatio: "1 / 1",
        transform: "translate(-50%, -50%)",
      }}
      onPointerMove={(e) =>
        drag.onPointerMove(e, ref.current?.parentElement ?? null)
      }
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerUp}
    >
      <div
        className="absolute inset-0 cursor-grab rounded-full border-[2.5px] border-white bg-white/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)] active:cursor-grabbing"
        onPointerDown={(e) => drag.onPointerDownMove(e, xPct, yPct)}
      />
      <button
        type="button"
        aria-label="Resize measure circle"
        className="absolute -bottom-2 -right-2 z-20 h-6 w-6 rounded-full border-2 border-[var(--accent-deep)] bg-white shadow"
        onPointerDown={(e) => drag.onPointerDownResize(e, dPct, xPct, yPct)}
      />
    </div>
  );
}

async function detectCardFromPhoto(dataUrl: string): Promise<DetectedCard | null> {
  const imageData = await photoToImageData(dataUrl);
  return detectCardRectAsync(imageData, null, {
    lite: true,
    relaxed: true,
    // OWL-ViT OOMs the WASM backend on phones — scanner/heuristic only there.
    useOwl: !isMobileDevice(),
  });
}

async function photoToImageData(dataUrl: string): Promise<ImageData> {
  const img = await loadImage(dataUrl);
  const maxW = 640;
  const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
  const w = Math.round((img.naturalWidth || maxW) * scale);
  const h = Math.round((img.naturalHeight || maxW) * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function Panel({
  children,
  flush,
}: {
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={flush ? "flex flex-1 flex-col" : "flex flex-1 flex-col pb-4"}
    >
      {children}
    </motion.div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <p className="mono-label text-[var(--gold-deep)]">{children}</p>;
}

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["intro", "capture", "preview", "result"];
  const idx = Math.max(
    0,
    order.indexOf(step === "align" ? "preview" : step)
  );
  const labels = ["Start", "Camera", "Size", "Saved"];

  return (
    <ol className="mb-5 flex items-center gap-1">
      {labels.map((label, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1">
            <span
              className={`mono flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] ${
                active
                  ? "bg-[var(--ink)] text-white"
                  : done
                    ? "bg-[var(--gold)] text-[var(--ink)]"
                    : "bg-[var(--surface-2)] text-[var(--muted)]"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={`mono-label hidden truncate sm:inline ${
                active ? "text-[var(--ink)]" : "text-[var(--muted)]"
              }`}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <span className="h-px min-w-2 flex-1 bg-[var(--border)]" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
