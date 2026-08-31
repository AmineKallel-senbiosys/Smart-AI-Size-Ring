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
  type WheelEvent as ReactWheelEvent,
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
  formatMm,
} from "@/lib/convert";
import {
  classifyCircumference,
  fitFromColor,
  type CircClassification,
  type FitColor,
} from "@/lib/explore-flow";
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

type Step = "intro" | "prep" | "capture" | "preview" | "align" | "result";
type MeasureMode = "ring" | "finger";

const MIN_DIAM_MM = 12;
const MAX_DIAM_MM = 24;
const DEFAULT_DIAM_MM = 17.3;
const MIN_PHOTO_ZOOM = 1;
const MAX_PHOTO_ZOOM = 4;
/** Finger circle size on photo (% of frame width) — adjust step UI */
const FINGER_CIRCLE_MIN_PCT = 3;
const FINGER_CIRCLE_MAX_PCT = 24;
const FINGER_CIRCLE_STEP = 0.02;
const FINGER_CIRCLE_NUDGE = 0.05;

export function CameraScan() {
  const { videoRef, status, error, start, stop, capture } = useCamera();
  const [step, setStep] = useState<Step>("intro");
  const [prepSlide, setPrepSlide] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [mode, setMode] = useState<MeasureMode>("finger");
  const [aiReady, setAiReady] = useState(false);
  const [opencvReady, setOpencvReady] = useState(false);
  const [aiStatus, setAiStatus] = useState("Tap Open camera to begin");
  const [liveCard, setLiveCard] = useState<DetectedCard | null>(null);
  const [liveFinger, setLiveFinger] = useState<DetectedFinger | null>(null);

  const [card, setCard] = useState({ x: 68, y: 58, w: 42 });
  const [circle, setCircle] = useState({ x: 32, y: 58, d: 14 });
  const [photoZoom, setPhotoZoom] = useState(1);
  /** Stage-% pan of the photo under the fixed-center circle (align step). */
  const [photoPan, setPhotoPan] = useState({ x: 0, y: 0 });
  const [photoAspect, setPhotoAspect] = useState(3 / 4);
  const [portalMounted, setPortalMounted] = useState(false);

  // Capture-quality checks (advisory — the shutter always stays available)
  const [envLum, setEnvLum] = useState<number | null>(null);
  const [distCm, setDistCm] = useState<number | null>(null);
  const [tiltDeg, setTiltDeg] = useState<number | null>(null);
  const [tiltRoll, setTiltRoll] = useState(0);
  const [tiltPitch, setTiltPitch] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const photoZoomRef = useRef(1);
  const photoPanRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const panDragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const pinchPointers = useRef(new Map<number, { x: number; y: number }>());
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
    photoZoomRef.current = photoZoom;
  }, [photoZoom]);

  useEffect(() => {
    photoPanRef.current = photoPan;
  }, [photoPan]);

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

  // Photo displayed object-contain so the full capture stays visible (letterboxed).
  // Card/circle state stays in PHOTO space; these convert to/from the
  // framed stage space for rendering and drag interactions.
  const photoFrame = useMemo(() => {
    if (stageW <= 0 || stageH <= 0 || photoAspect <= 0) {
      return { dw: stageW || 320, dh: stageH || 480, ox: 0, oy: 0 };
    }
    let dw: number;
    let dh: number;
    if (stageW / stageH > photoAspect) {
      dh = stageH;
      dw = stageH * photoAspect;
    } else {
      dw = stageW;
      dh = stageW / photoAspect;
    }
    return {
      dw,
      dh,
      ox: (stageW - dw) / 2,
      oy: (stageH - dh) / 2,
    };
  }, [stageW, stageH, photoAspect]);

  const photoToStage = useCallback(
    (xPct: number, yPct: number, sizePct: number) => ({
      x: ((photoFrame.ox + (xPct / 100) * photoFrame.dw) / stageW) * 100,
      y: ((photoFrame.oy + (yPct / 100) * photoFrame.dh) / stageH) * 100,
      size: (sizePct * photoFrame.dw) / stageW,
    }),
    [photoFrame, stageW, stageH]
  );

  const stageToPhotoXY = useCallback(
    (xStagePct: number, yStagePct: number) => ({
      x: (((xStagePct / 100) * stageW - photoFrame.ox) / photoFrame.dw) * 100,
      y: (((yStagePct / 100) * stageH - photoFrame.oy) / photoFrame.dh) * 100,
    }),
    [photoFrame, stageW, stageH]
  );

  const stageToPhotoSize = useCallback(
    (sizeStagePct: number) => (sizeStagePct * stageW) / photoFrame.dw,
    [photoFrame, stageW]
  );

  const circleOnStage = photoToStage(circle.x, circle.y, circle.d);

  /** Keep the photo point under the fixed reticle when zoom changes. */
  const setZoomKeepingCenter = useCallback((nextZoom: number) => {
    const prev = photoZoomRef.current;
    const z = clamp(nextZoom, MIN_PHOTO_ZOOM, MAX_PHOTO_ZOOM);
    if (prev > 0 && Math.abs(z - prev) > 1e-6) {
      const scale = z / prev;
      setPhotoPan((p) => {
        const next = { x: p.x * scale, y: p.y * scale };
        photoPanRef.current = next;
        return next;
      });
    }
    photoZoomRef.current = z;
    setPhotoZoom(z);
  }, []);

  const applyPanAndSyncCircle = useCallback(
    (nextPan: { x: number; y: number }, zoom = photoZoomRef.current) => {
      const baseMaxX =
        stageW > 0 ? (photoFrame.ox / stageW) * 100 : 0;
      const baseMaxY =
        stageH > 0 ? (photoFrame.oy / stageH) * 100 : 0;
      const extra = Math.max(0, zoom - 1) * 42;
      const maxX = baseMaxX + extra;
      const maxY = baseMaxY + extra;
      const pan = {
        x: clamp(nextPan.x, -maxX, maxX),
        y: clamp(nextPan.y, -maxY, maxY),
      };
      photoPanRef.current = pan;
      setPhotoPan(pan);
      const stageX = clamp(50 - pan.x / zoom, 2, 98);
      const stageY = clamp(50 - pan.y / zoom, 2, 98);
      setCircle((c) => ({ ...c, ...stageToPhotoXY(stageX, stageY) }));
    },
    [stageToPhotoXY, photoFrame, stageW, stageH]
  );

  // Entering align: keep full photo visible; user slides finger under fixed circle.
  // Leaving align: reset zoom/pan.
  useEffect(() => {
    if (step !== "align") {
      setPhotoZoom(1);
      setPhotoPan({ x: 0, y: 0 });
      photoZoomRef.current = 1;
      photoPanRef.current = { x: 0, y: 0 };
      pinchRef.current = null;
      panDragRef.current = null;
      pinchPointers.current.clear();
      return;
    }
    photoPanRef.current = { x: 0, y: 0 };
    setPhotoPan({ x: 0, y: 0 });
    photoZoomRef.current = 1;
    setPhotoZoom(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const nudgePhotoZoom = useCallback(
    (delta: number) => {
      const next =
        Math.round(
          clamp(photoZoomRef.current + delta, MIN_PHOTO_ZOOM, MAX_PHOTO_ZOOM) *
            10
        ) / 10;
      setZoomKeepingCenter(next);
    },
    [setZoomKeepingCenter]
  );

  const onAlignPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (step !== "align") return;
      pinchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchPointers.current.size === 1) {
        panDragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          originX: photoPanRef.current.x,
          originY: photoPanRef.current.y,
        };
      } else {
        panDragRef.current = null;
        pinchRef.current = null;
      }
    },
    [step]
  );

  const onAlignPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (step !== "align") return;
      if (!pinchPointers.current.has(e.pointerId)) return;
      pinchPointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pinchPointers.current.size >= 2) {
        panDragRef.current = null;
        const pts = [...pinchPointers.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (dist < 8) return;
        if (!pinchRef.current) {
          pinchRef.current = {
            startDist: dist,
            startZoom: photoZoomRef.current,
          };
          return;
        }
        const next =
          pinchRef.current.startZoom * (dist / pinchRef.current.startDist);
        setZoomKeepingCenter(next);
        return;
      }

      if (!panDragRef.current || !stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dx =
        ((e.clientX - panDragRef.current.startX) / rect.width) * 100;
      const dy =
        ((e.clientY - panDragRef.current.startY) / rect.height) * 100;
      applyPanAndSyncCircle({
        x: panDragRef.current.originX + dx,
        y: panDragRef.current.originY + dy,
      });
    },
    [step, setZoomKeepingCenter, applyPanAndSyncCircle]
  );

  const onAlignPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      pinchPointers.current.delete(e.pointerId);
      if (pinchPointers.current.size < 2) pinchRef.current = null;
      if (pinchPointers.current.size === 0) {
        panDragRef.current = null;
      } else if (pinchPointers.current.size === 1) {
        const remaining = [...pinchPointers.current.values()][0];
        panDragRef.current = {
          startX: remaining.x,
          startY: remaining.y,
          originX: photoPanRef.current.x,
          originY: photoPanRef.current.y,
        };
      }
    },
    []
  );

  const onPhotoWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      if (step !== "align") return;
      e.preventDefault();
      nudgePhotoZoom(e.deltaY < 0 ? 0.2 : -0.2);
    },
    [step, nudgePhotoZoom]
  );

  const applyAdjust = useCallback(() => {
    setPhotoZoom(1);
    setPhotoPan({ x: 0, y: 0 });
    setStep("preview");
  }, []);

  // Phone tilt — 0° means the phone is flat, camera looking straight down,
  // i.e. perpendicular to the hand and card on the table.
  useEffect(() => {
    if (step !== "capture") return;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      setTiltDeg(Math.round(Math.min(90, Math.hypot(e.beta, e.gamma))));
      // Pitch (front–back) and roll (left–right) drive the two + marks.
      setTiltPitch(Math.max(-45, Math.min(45, e.beta)));
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

  const cardPx = (card.w / 100) * photoFrame.dw;
  const diameterPx = (circle.d / 100) * photoFrame.dw;

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

  const sizeClassification = useMemo(
    () => classifyCircumference(circumferenceMm),
    [circumferenceMm]
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

  const beginCameraPrep = useCallback(() => {
    setPrepSlide(0);
    setStep("prep");
  }, []);

  const continuePrep = useCallback(() => {
    if (prepSlide < 3) {
      setPrepSlide((s) => s + 1);
      return;
    }
    openCamera();
  }, [prepSlide, openCamera]);

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
        d: clamp(fingerSeed.dPct, FINGER_CIRCLE_MIN_PCT, FINGER_CIRCLE_MAX_PCT),
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
    setPrepSlide(0);
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
                        <LevelCrosshairs
                          pitchDeg={tiltPitch}
                          rollDeg={tiltRoll}
                          ready={tiltDeg != null}
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
                <div
                  className={`relative min-h-0 flex-1 ${
                    step === "align" ? "bg-black" : ""
                  }`}
                >
                  <div
                    ref={stageRef}
                    className="absolute inset-0 touch-none select-none overflow-hidden bg-black"
                    onWheel={onPhotoWheel}
                  >
                    {step === "align" && (
                      <div
                        className="pointer-events-none absolute inset-3 z-[4] rounded-xl border-2 border-[var(--gold)]/50 shadow-[inset_0_0_24px_rgba(184,147,74,0.08)]"
                        aria-hidden
                      />
                    )}

                    <div
                      className="absolute inset-0"
                      style={
                        step === "align"
                          ? {
                              transform: `translate(${photoPan.x}%, ${photoPan.y}%) scale(${photoZoom})`,
                              transformOrigin: "50% 50%",
                            }
                          : undefined
                      }
                      onPointerDown={onAlignPointerDown}
                      onPointerMove={onAlignPointerMove}
                      onPointerUp={onAlignPointerUp}
                      onPointerCancel={onAlignPointerUp}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo}
                        alt="Captured sizing photo"
                        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                        draggable={false}
                      />
                      {step === "align" && (
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
                      )}
                      {step === "preview" && (
                        <div
                          className="absolute z-10"
                          style={{
                            left: `${photoToStage(card.x, card.y, card.w).x}%`,
                            top: `${photoToStage(card.x, card.y, card.w).y}%`,
                            width: `${photoToStage(card.x, card.y, card.w).size}%`,
                            aspectRatio: `${CARD_WIDTH_MM} / ${CARD_HEIGHT_MM}`,
                            transform: "translate(-50%, -50%)",
                            pointerEvents: "none",
                          }}
                        >
                          <div className="absolute inset-0 rounded-[5px] border-[2.5px] border-[var(--accent-glow)]/60 bg-[var(--accent)]/10" />
                        </div>
                      )}
                      {step === "preview" && (
                        <CircleOverlay
                          xPct={circleOnStage.x}
                          yPct={circleOnStage.y}
                          dPct={circleOnStage.size}
                          interactive={false}
                        />
                      )}
                    </div>

                    {/* Align: circle stays locked to screen center; photo pans under it. */}
                    {step === "align" && (
                      <CircleOverlay
                        xPct={50}
                        yPct={50}
                        dPct={circleOnStage.size * photoZoom}
                        interactive={false}
                      />
                    )}
                  </div>

                  {step === "align" && (
                    <div className="absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => nudgePhotoZoom(0.5)}
                        disabled={photoZoom >= MAX_PHOTO_ZOOM}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-2xl leading-none text-white backdrop-blur-sm disabled:opacity-35"
                        aria-label="Zoom in"
                      >
                        +
                      </button>
                      <span className="mono rounded-full bg-black/55 px-2 py-1 text-[10px] text-white/80 backdrop-blur-sm">
                        {photoZoom.toFixed(1)}×
                      </span>
                      <button
                        type="button"
                        onClick={() => nudgePhotoZoom(-0.5)}
                        disabled={photoZoom <= MIN_PHOTO_ZOOM}
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-2xl leading-none text-white backdrop-blur-sm disabled:opacity-35"
                        aria-label="Zoom out"
                      >
                        −
                      </button>
                    </div>
                  )}

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
                      {step === "preview" ? "Your measure" : "Adjust finger"}
                    </p>
                    <span className="w-10" aria-hidden />
                  </div>
                </div>

                <div
                  className={`camera-safe-bottom relative z-20 shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent ${
                    step === "align" ? "px-3 pb-3 pt-2" : "px-4 pb-4 pt-5"
                  }`}
                >
                  {step === "preview" ? (
                    <>
                      <CameraMeasureCard
                        circumferenceMm={circumferenceMm}
                        classification={sizeClassification}
                      />
                      <button
                        type="button"
                        onClick={() => setStep("align")}
                        className="mt-4 w-full rounded-xl border border-white/25 bg-white/10 py-3 text-sm font-medium text-white backdrop-blur-sm"
                      >
                        Adjust finger
                      </button>
                    </>
                  ) : (
                    <>
                      <FingerAdjustPanel
                        circleD={circle.d}
                        circumferenceMm={circumferenceMm}
                        classification={sizeClassification}
                        cardW={card.w}
                        onCircleD={(d) =>
                          setCircle((c) => ({
                            ...c,
                            d: clamp(
                              d,
                              FINGER_CIRCLE_MIN_PCT,
                              FINGER_CIRCLE_MAX_PCT
                            ),
                          }))
                        }
                        onCardW={(w) => setCard((c) => ({ ...c, w }))}
                      />
                      <button
                        type="button"
                        onClick={applyAdjust}
                        className="gold-fill mt-2 w-full rounded-xl py-2.5 text-sm font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
                      >
                        Apply
                      </button>
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
        className={`mx-auto flex w-full max-w-lg flex-col px-4 ${
          step === "prep"
            ? "h-[calc(100dvh-3.5rem)] overflow-hidden py-3"
            : "min-h-[calc(100dvh-3.5rem)] py-4 sm:py-6"
        } ${isFullscreen ? "invisible h-0 overflow-hidden p-0" : ""}`}
      >
      {step !== "prep" && <StepDots step={step} />}

      <div className={step === "prep" ? "flex min-h-0 flex-1 flex-col" : undefined}>
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
              onClick={beginCameraPrep}
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

        {step === "prep" && (
          <CameraPrepSlides
            key="prep"
            slide={prepSlide}
            onContinue={continuePrep}
            onBack={() => {
              if (prepSlide > 0) setPrepSlide((s) => s - 1);
              else setStep("intro");
            }}
          />
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
              <div className="mt-5 inline-flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-4">
                <p className="font-[family-name:var(--font-display)] text-5xl font-bold leading-none text-[var(--gold-light)]">
                  US {sizeClassification.us}
                </p>
                <p className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
                  {FIT_ZONE_LABEL[fitFromColor(sizeClassification.color)]}
                </p>
                <p className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${FIT_ZONE_STYLE[sizeClassification.color].chip}`}
                    aria-hidden
                  />
                  <span className="mono text-[11px] text-[var(--muted)]">
                    {FIT_ZONE_STYLE[sizeClassification.color].label} zone
                  </span>
                </p>
              </div>
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
      className={`relative flex h-full w-full items-end justify-center gap-4 pb-2 ${
        staticPreview ? "min-h-[168px]" : ""
      }`}
    >
      <div className="relative mb-1 flex w-[38%] flex-col items-center">
        <p className="mono absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] tracking-wider text-white/85">
          FINGER
        </p>
        <div className="relative w-full">
          <svg
            viewBox="0 0 80 150"
            className={`w-full ${staticPreview ? "opacity-95" : "guide-pulse opacity-95"}`}
            aria-hidden
          >
            <defs>
              <linearGradient id="introFingerFill" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
                <stop offset="45%" stopColor="rgba(255,255,255,0.3)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.14)" />
              </linearGradient>
            </defs>
            <path
              d="M26 148 V78
                 C26 68 24 62 24 54
                 C24 42 28 34 28 26
                 C28 14 34 6 40 6
                 C46 6 52 14 52 26
                 C52 34 56 42 56 54
                 C56 62 54 68 54 78
                 V148 Z"
              fill="url(#introFingerFill)"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M29 52 Q40 48 51 52"
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <ellipse
              cx="40"
              cy="54"
              rx="11"
              ry="5"
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1"
            />
            <path
              d="M33 18 C35 10 45 10 47 18 C45 22 35 22 33 18 Z"
              fill="rgba(255,255,255,0.24)"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="0.8"
            />
            {/* Measure circle at ring seat — outer edge meets finger outline */}
            <circle
              cx="40"
              cy="88"
              r="13.3"
              fill="none"
              stroke="var(--accent-glow)"
              strokeWidth="1.4"
            />
          </svg>
        </div>
      </div>

      <div className="relative w-[46%]">
        <p className="mono absolute -top-5 left-0 text-[10px] tracking-wider text-[var(--accent-glow)]">
          CARD
        </p>
        <div
          className={`w-full rounded-[6px] border-2 border-dashed border-[var(--accent-glow)] bg-[var(--accent)]/15 ${
            staticPreview ? "" : "guide-pulse"
          }`}
          style={{ aspectRatio: `${CARD_WIDTH_MM} / ${CARD_HEIGHT_MM}` }}
        />
      </div>
    </div>
  );
}

/**
 * iPhone Camera-style top-down level: a fixed white + in the centre and a
 * moving yellow + driven by pitch/roll. When they overlap, they merge into
 * one yellow + to show the phone is flat over the table.
 */
function LevelCrosshairs({
  pitchDeg,
  rollDeg,
  ready,
}: {
  pitchDeg: number;
  rollDeg: number;
  ready: boolean;
}) {
  const RANGE_DEG = 18;
  const MAX_PX = 58;
  const ALIGN_DEG = 1.8;

  const aligned = ready && Math.hypot(pitchDeg, rollDeg) <= ALIGN_DEG;
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    if (!aligned) {
      setFaded(false);
      return;
    }
    const t = setTimeout(() => setFaded(true), 1000);
    return () => clearTimeout(t);
  }, [aligned]);

  if (!ready) return null;

  const nx = Math.max(-1, Math.min(1, rollDeg / RANGE_DEG));
  const ny = Math.max(-1, Math.min(1, pitchDeg / RANGE_DEG));
  const x = aligned ? 0 : nx * MAX_PX;
  const y = aligned ? 0 : ny * MAX_PX;

  const yellow = "#ffd60a";
  const white = "rgba(255,255,255,0.95)";

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 z-[6] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-500"
      style={{ opacity: faded ? 0 : 1 }}
      aria-hidden
    >
      {/* Fixed centre target */}
      <PlusMark
        color={aligned ? yellow : white}
        size={aligned ? 18 : 16}
        thickness={aligned ? 2.4 : 2}
      />
      {/* Moving + — hidden once snapped together */}
      {!aligned && (
        <span
          className="absolute left-1/2 top-1/2"
          style={{
            width: 16,
            height: 16,
            marginLeft: -8,
            marginTop: -8,
            transform: `translate(${x}px, ${y}px)`,
          }}
        >
          <PlusMark color={yellow} size={16} thickness={2} />
        </span>
      )}
    </div>
  );
}

function PlusMark({
  color,
  size,
  thickness,
}: {
  color: string;
  size: number;
  thickness: number;
}) {
  const shadow = "0 0 3px rgba(0,0,0,0.55)";
  return (
    <span
      className="relative block"
      style={{ width: size, height: size }}
    >
      <span
        className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: size,
          height: thickness,
          background: color,
          boxShadow: shadow,
        }}
      />
      <span
        className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full"
        style={{
          width: thickness,
          height: size,
          background: color,
          boxShadow: shadow,
        }}
      />
    </span>
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

const FIT_ZONE_STYLE: Record<
  FitColor,
  { chip: string; label: string; pill: string }
> = {
  green: {
    chip: "bg-emerald-500",
    label: "Green",
    pill: "border-emerald-500/40 bg-emerald-500/15",
  },
  red: {
    chip: "bg-red-500",
    label: "Red",
    pill: "border-red-500/40 bg-red-500/15",
  },
  black: {
    chip: "bg-neutral-200 ring-1 ring-white/30",
    label: "Black",
    pill: "border-white/25 bg-white/10",
  },
};

const FIT_ZONE_LABEL: Record<"ok" | "loose" | "tight", string> = {
  ok: "Ok",
  loose: "Loose",
  tight: "Tight",
};

function CameraMeasureCard({
  circumferenceMm,
  classification,
  compact = false,
}: {
  circumferenceMm: number;
  classification: CircClassification;
  compact?: boolean;
}) {
  const zone = FIT_ZONE_STYLE[classification.color];
  const fit = fitFromColor(classification.color);

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-black/50 px-3 py-2 backdrop-blur-md">
        <div className="min-w-0 text-left">
          <p className="mono text-[9px] text-white/45">Circumference</p>
          <p className="font-[family-name:var(--font-display)] text-xl font-bold leading-none text-[var(--gold-light)]">
            {formatMm(circumferenceMm)}
            <span className="ml-1 text-xs font-normal text-white/60">mm</span>
          </p>
        </div>
        <div
          className={`flex shrink-0 flex-col items-end rounded-lg border px-2.5 py-1.5 ${zone.pill}`}
        >
          <p className="font-[family-name:var(--font-display)] text-lg font-bold leading-none text-[var(--gold-light)]">
            US {classification.us}
          </p>
          <p className="mt-0.5 flex items-center gap-1">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${zone.chip}`}
              aria-hidden
            />
            <span className="mono text-[8px] text-white/55">
              {FIT_ZONE_LABEL[fit]}
            </span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-black/55 px-5 py-5 text-center backdrop-blur-md">
      <p className="mono-label text-[var(--gold-light)]">Circumference</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-5xl font-bold leading-none text-[var(--gold-light)]">
        {formatMm(circumferenceMm)}
        <span className="ml-2 text-2xl font-normal text-white/70">mm</span>
      </p>
      <div
        className={`mt-4 inline-flex flex-col items-center gap-1.5 rounded-2xl border px-5 py-3 ${zone.pill}`}
      >
        <p className="font-[family-name:var(--font-display)] text-4xl font-bold leading-none text-[var(--gold-light)]">
          US {classification.us}
        </p>
        <p className="font-[family-name:var(--font-display)] text-lg text-white">
          {FIT_ZONE_LABEL[fit]}
        </p>
        <p className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${zone.chip}`}
            aria-hidden
          />
          <span className="mono text-[10px] text-white/55">{zone.label} zone</span>
        </p>
      </div>
    </div>
  );
}

function FingerAdjustPanel({
  circleD,
  circumferenceMm,
  classification,
  cardW,
  onCircleD,
  onCardW,
}: {
  circleD: number;
  circumferenceMm: number;
  classification: CircClassification;
  cardW: number;
  onCircleD: (d: number) => void;
  onCardW: (w: number) => void;
}) {
  const nudge = (delta: number) => {
    onCircleD(
      clamp(
        +(circleD + delta).toFixed(2),
        FINGER_CIRCLE_MIN_PCT,
        FINGER_CIRCLE_MAX_PCT
      )
    );
  };

  return (
    <div className="space-y-2">
      <p className="mono text-center text-[9px] tracking-wider text-[var(--gold-light)]/80">
        SLIDE TO MOVE · PINCH OR + / − TO ZOOM
      </p>

      <CameraMeasureCard
        circumferenceMm={circumferenceMm}
        classification={classification}
        compact
      />

      <div className="rounded-xl border border-white/15 bg-black/45 px-3 py-3 backdrop-blur-md">
        <p className="mono-label mb-2 text-center text-[10px] text-white/55">
          Finger width
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Make finger circle narrower"
            onClick={() => nudge(-FINGER_CIRCLE_NUDGE)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-xl leading-none text-white transition-colors active:bg-white/20"
          >
            −
          </button>
          <input
            type="range"
            min={FINGER_CIRCLE_MIN_PCT}
            max={FINGER_CIRCLE_MAX_PCT}
            step={FINGER_CIRCLE_STEP}
            value={circleD}
            onChange={(e) => onCircleD(+e.target.value)}
            className="camera-range min-w-0 flex-1"
            aria-label="Finger width"
          />
          <button
            type="button"
            aria-label="Make finger circle wider"
            onClick={() => nudge(FINGER_CIRCLE_NUDGE)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-xl leading-none text-white transition-colors active:bg-white/20"
          >
            +
          </button>
        </div>
      </div>

      <details className="group rounded-lg border border-white/10 bg-black/30 px-3 py-1.5">
        <summary className="mono-label cursor-pointer list-none text-center text-white/40 [&::-webkit-details-marker]:hidden">
          Card width
        </summary>
        <input
          type="range"
          min={18}
          max={70}
          step={0.1}
          value={cardW}
          onChange={(e) => onCardW(+e.target.value)}
          className="camera-range mt-3 w-full"
          aria-label="Card width"
        />
      </details>
    </div>
  );
}

function CircleOverlay({
  xPct,
  yPct,
  dPct,
  onMove,
  interactive = true,
}: {
  xPct: number;
  yPct: number;
  dPct: number;
  onMove?: (x: number, y: number) => void;
  interactive?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useDragPct(onMove ?? (() => {}));

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
        pointerEvents: interactive ? "auto" : "none",
      }}
      onPointerMove={(e) =>
        interactive &&
        drag.onPointerMove(e, ref.current?.parentElement ?? null)
      }
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerUp}
    >
      <div
        className={`absolute inset-0 rounded-full bg-transparent ${
          interactive ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        style={{
          boxShadow:
            "0 0 0 0.5px rgba(255,255,255,0.92), 0 0 0 9999px rgba(0,0,0,0.25)",
        }}
        onPointerDown={(e) =>
          interactive && drag.onPointerDownMove(e, xPct, yPct)
        }
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

function CameraPrepSlides({
  slide,
  onContinue,
  onBack,
}: {
  slide: number;
  onContinue: () => void;
  onBack: () => void;
}) {
  const slides = [
    {
      badge: "Step 1 of 4",
      title: "Room light",
      body: "Use medium brightness — not too dark, not too bright. Avoid harsh shadows and direct glare on the card.",
      visual: <PrepLightVisual />,
    },
    {
      badge: "Step 2 of 4",
      title: "Distance",
      body: "Hold the phone 26–30 cm above your hand and card — about one hand width. Too close or too far will skew the measure.",
      visual: <PrepDistanceVisual />,
    },
    {
      badge: "Step 3 of 4",
      title: "Level & symmetry",
      body: "Tilt the phone until the yellow + merges with the white + in the center. Both crosses should be perfectly aligned before you capture.",
      visual: <PrepLevelVisual />,
    },
    {
      badge: "Step 4 of 4",
      title: "Adjust the circle",
      body: "After the snap, tap Adjust finger. Slide until the circle sits on your ring finger, then resize so it touches both skin edges — not folds, not empty space.",
      visual: <PrepAdjustVisual />,
    },
  ] as const;

  const current = slides[slide] ?? slides[0];
  const isLast = slide >= slides.length - 1;

  return (
    <Panel key={`prep-${slide}`} flush>
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="mono self-start text-xs text-[var(--muted)] underline-offset-4 hover:underline"
        >
          ← Back
        </button>

        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--stage)]">
          <div className="flex h-[min(34svh,220px)] items-center justify-center bg-gradient-to-b from-[var(--ink)] to-[#1a1814] px-4 py-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={slide}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22 }}
                className="w-full max-w-[280px]"
              >
                {current.visual}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
            <p className="mono-label text-[var(--gold-deep)]">{current.badge}</p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-[var(--ink)]">
              {current.title}
            </h2>
            <p className="mt-2 text-[13px] leading-snug text-[var(--muted)]">
              {current.body}
            </p>
          </div>
        </div>

        <div className="flex justify-center gap-2">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === slide
                  ? "w-6 bg-[var(--gold)]"
                  : "w-1.5 bg-[var(--border)]"
              }`}
              aria-hidden
            />
          ))}
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="gold-fill w-full shrink-0 rounded-xl px-5 py-3 text-[15px] font-medium text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_12px_28px_-14px_rgba(184,147,74,0.55)]"
        >
          {isLast ? "Open camera" : "Continue"}
        </button>
      </div>
    </Panel>
  );
}

function PrepLightVisual() {
  return (
    <div className="mx-auto flex flex-col items-center gap-2.5">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
        <svg viewBox="0 0 64 64" className="h-10 w-10" aria-hidden>
          <circle cx="32" cy="32" r="14" fill="#ffd60a" opacity="0.95" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={deg}
              x1="32"
              y1="32"
              x2="32"
              y2="10"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2.5"
              strokeLinecap="round"
              transform={`rotate(${deg} 32 32)`}
            />
          ))}
        </svg>
      </div>
      <div className="flex w-full max-w-[160px] items-end justify-center gap-1">
        {[0.35, 0.55, 0.75, 0.55, 0.35].map((h, i) => (
          <span
            key={i}
            className="w-4 rounded-sm bg-[var(--gold)]"
            style={{ height: `${h * 32}px`, opacity: i === 2 ? 1 : 0.45 }}
          />
        ))}
      </div>
      <p className="mono text-center text-[9px] tracking-wider text-white/70">
        MEDIUM BRIGHTNESS
      </p>
    </div>
  );
}

function PrepDistanceVisual() {
  return (
    <div className="mx-auto flex flex-col items-center gap-2">
      <div className="relative h-28 w-full max-w-[200px]">
        <div className="absolute left-1/2 top-1 h-10 w-14 -translate-x-1/2 rounded-lg border-2 border-white/80 bg-white/10" />
        <div className="absolute bottom-1 left-1/2 flex w-[88%] -translate-x-1/2 items-end justify-between">
          <div className="h-8 w-6 rounded-t-full border-2 border-dashed border-white/70" />
          <div
            className="rounded-md border-2 border-dashed border-[var(--accent-glow)] bg-[var(--accent)]/20"
            style={{
              width: 36,
              aspectRatio: `${CARD_WIDTH_MM} / ${CARD_HEIGHT_MM}`,
            }}
          />
        </div>
        <div className="absolute left-1/2 top-[38%] flex -translate-x-1/2 flex-col items-center">
          <span className="h-7 w-px bg-[var(--gold)]" />
          <span className="mono rounded-full bg-[var(--gold)] px-2 py-0.5 text-[9px] font-medium text-[var(--ink)]">
            26–30 cm
          </span>
          <span className="h-4 w-px bg-[var(--gold)]" />
        </div>
      </div>
      <p className="mono text-center text-[9px] tracking-wider text-white/70">
        PHONE ABOVE HAND & CARD
      </p>
    </div>
  );
}

function PrepLevelVisual() {
  return (
    <div className="mx-auto flex flex-col items-center gap-3">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-black/35">
        <PlusMark color="rgba(255,255,255,0.95)" size={18} thickness={2} />
        <PlusMark color="#ffd60a" size={18} thickness={2} />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-1">
          <PlusMark color="rgba(255,255,255,0.95)" size={12} thickness={1.8} />
          <span className="mono text-[8px] text-white/55">WHITE</span>
        </div>
        <span className="text-base text-white/40">→</span>
        <div className="flex flex-col items-center gap-1">
          <PlusMark color="#ffd60a" size={12} thickness={1.8} />
          <span className="mono text-[8px] text-[var(--gold-light)]">YELLOW</span>
        </div>
      </div>
      <p className="mono text-center text-[9px] tracking-wider text-white/70">
        ALIGN BOTH + MARKS
      </p>
    </div>
  );
}

function PrepAdjustVisual() {
  return (
    <div className="mx-auto flex w-full max-w-[260px] flex-col items-center gap-2">
      <div className="grid w-full grid-cols-3 gap-1.5">
        <PrepFingerExample
          label="Too small"
          tone="bad"
          circleScale={0.68}
        />
        <PrepFingerExample
          label="Correct"
          tone="good"
          circleScale={1}
          showArrows
        />
        <PrepFingerExample
          label="Too big"
          tone="bad"
          circleScale={1.32}
        />
      </div>
      <p className="mono text-center text-[9px] tracking-wider text-white/70">
        MATCH LEFT & RIGHT SKIN EDGES
      </p>
    </div>
  );
}

const PREP_RING_CX = 40;
const PREP_RING_CY = 88;
/** Half-width of finger at ring seat in viewBox units (edges at x≈26 and x≈54). */
const PREP_RING_R = 14;

function PrepFingerExample({
  label,
  tone,
  circleScale,
  showArrows = false,
}: {
  label: string;
  tone: "good" | "bad";
  circleScale: number;
  showArrows?: boolean;
}) {
  const good = tone === "good";
  const gradId = `fingerFill-${tone}-${Math.round(circleScale * 100)}`;
  const maskId = `prepMask-${gradId}`;
  const ringR = PREP_RING_R * circleScale;
  const ringStroke = 1.4;
  // Stroke is centered on path — inset radius so outer edge meets finger outline.
  const ringPathR = Math.max(4, ringR - ringStroke / 2);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative flex h-[96px] w-full items-center justify-center overflow-hidden rounded-lg border ${
          good
            ? "border-[var(--gold)]/70 bg-white/[0.07]"
            : "border-white/15 bg-black/30"
        }`}
      >
        <svg viewBox="0 0 80 150" className="h-[88px] w-auto" aria-hidden>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
              <stop offset="45%" stopColor="rgba(255,255,255,0.28)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.14)" />
            </linearGradient>
            <mask id={maskId}>
              <rect width="80" height="150" fill="white" />
              <circle
                cx={PREP_RING_CX}
                cy={PREP_RING_CY}
                r={ringPathR}
                fill="black"
              />
            </mask>
          </defs>
          <path
            d="M26 148 V78
               C26 68 24 62 24 54
               C24 42 28 34 28 26
               C28 14 34 6 40 6
               C46 6 52 14 52 26
               C52 34 56 42 56 54
               C56 62 54 68 54 78
               V148 Z"
            fill={`url(#${gradId})`}
            stroke="rgba(255,255,255,0.78)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M29 52 Q40 48 51 52"
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <ellipse
            cx="40"
            cy="54"
            rx="11"
            ry="5"
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1"
          />
          <path
            d="M33 18 C35 10 45 10 47 18 C45 22 35 22 33 18 Z"
            fill="rgba(255,255,255,0.22)"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="0.8"
          />
          <rect
            width="80"
            height="150"
            fill="rgba(0,0,0,0.22)"
            mask={`url(#${maskId})`}
          />
          <circle
            cx={PREP_RING_CX}
            cy={PREP_RING_CY}
            r={ringPathR}
            fill="none"
            stroke={good ? "#ffd60a" : "rgba(255,255,255,0.9)"}
            strokeWidth={ringStroke}
          />
          {showArrows && (
            <>
              <text
                x={PREP_RING_CX - ringPathR - 5}
                y={PREP_RING_CY + 1}
                textAnchor="end"
                dominantBaseline="middle"
                fill="#ffd60a"
                fontSize="9"
                fontWeight="700"
              >
                ←
              </text>
              <text
                x={PREP_RING_CX + ringPathR + 5}
                y={PREP_RING_CY + 1}
                textAnchor="start"
                dominantBaseline="middle"
                fill="#ffd60a"
                fontSize="9"
                fontWeight="700"
              >
                →
              </text>
            </>
          )}
        </svg>

        {!good && (
          <span
            className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/15 text-[9px] text-white/70"
            aria-hidden
          >
            ×
          </span>
        )}
        {good && (
          <span
            className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--gold)] text-[8px] font-bold text-[var(--ink)]"
            aria-hidden
          >
            ✓
          </span>
        )}
      </div>
      <span
        className={`mono text-center text-[8px] tracking-wider ${
          good ? "text-[var(--gold-light)]" : "text-white/45"
        }`}
      >
        {label.toUpperCase()}
      </span>
    </div>
  );
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
      className={
        flush
          ? "flex min-h-0 flex-1 flex-col"
          : "flex flex-1 flex-col pb-4"
      }
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
    order.indexOf(
      step === "align" ? "preview" : step === "prep" ? "intro" : step
    )
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
