"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HandIllustration } from "@/components/onehand/HandIllustration";
import { HandPhoto } from "@/components/onehand/HandPhoto";
import {
  AutoCaptureGate,
  cameraCaptureAllowed,
  canvasPhoto,
  captureAngleAllowed,
  getSession,
  inspectFrame,
  liveCheckMessage,
  measurePhoto,
  phoneLevel,
  preFrameDue,
  publishActivity,
  sizeRows,
  type FingerKey,
  type Level,
  type OneHandSession,
} from "@/lib/onehand/engine";

type Phase = "loading" | "missing" | "intro" | "camera" | "processing" | "result" | "error";

const TIPS: [string, string][] = [
  ["Use a standard-size card", "Any bank-card-size card works. A blank one is best. Nothing on it is read or stored."],
  ["Place the card above your fingertips", "Keep all four edges of the card visible and flat on the same surface as your hand."],
  ["Back of the hand toward the camera", "Rest your palm lightly on the surface and gently spread all five fingers."],
  ["Choose a plain, matte background", "A medium tone, neither very light nor very dark, keeps the edges clear."],
  ["Lay your phone flat", "Hold the phone directly above, level within 3°. The photo is taken automatically."],
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestOrientation(): Promise<string | null> {
  const Ctor = globalThis.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  try {
    if (typeof Ctor?.requestPermission === "function") {
      const result = await Ctor.requestPermission();
      if (result !== "granted") return "Motion access was declined. Enable it in your browser settings to take the photo.";
    }
  } catch {
    return "Motion access was declined. Enable it in your browser settings to take the photo.";
  }
  return null;
}

async function takeFrame(track: MediaStreamTrack, video: HTMLVideoElement) {
  type ImageCaptureCtor = new (track: MediaStreamTrack) => { takePhoto(): Promise<Blob> };
  const IC = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
  if (IC) {
    try {
      const bitmap = await createImageBitmap(await new IC(track).takePhoto());
      try {
        return canvasPhoto(bitmap, video);
      } finally {
        bitmap.close();
      }
    } catch {
      /* fall back to the live frame */
    }
  }
  return canvasPhoto(video, video);
}

/** Figma phone frames are 393 x 740: lay them out in that space and scale it to the real screen. */
const DESIGN_W = 393;
const DESIGN_H = 740;
const PHONE_INTRO_SRC = "/velia/phone-intro.jpg";
const PHONE_THUMB_SRC = "/velia/phone-thumb.png";

function useStage() {
  const [box, setBox] = useState({ scale: 1, top: 0 });
  useEffect(() => {
    const fit = () => {
      const scale = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
      setBox({ scale, top: Math.max(0, (window.innerHeight - DESIGN_H * scale) / 2) });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return box;
}

/** A photo from public/ with a drawn fallback underneath until the file exists. */
function PhotoSlot({ src, className, children }: { src: string; className: string; children?: ReactNode }) {
  const [ok, setOk] = useState(true);
  return (
    <div className={className}>
      {children}
      {ok && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="ohc-photo" onError={() => setOk(false)} />
      )}
    </div>
  );
}

function RingPending() {
  return (
    <svg className="ohc-spin" width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2" />
      <path d="M10 2a8 8 0 0 1 8 8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function RingDone({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="10" fill="#26a100" />
      <path d="M5.8 10.4l3 3 5.4-6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const same = (a: boolean[], b: boolean[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function PhoneFlow({ sessionId }: { sessionId: string | null }) {
  const [phase, setPhase] = useState<Phase>(sessionId ? "loading" : "missing");
  const [session, setSession] = useState<OneHandSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<boolean[]>([false, false, false]);
  const [count, setCount] = useState<number | null>(null);
  const [taking, setTaking] = useState(false);
  const [liveMessage, setLiveMessage] = useState("Starting the camera…");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [bubble, setBubble] = useState<{ x: number; y: number; angle: number } | null>(null);
  const [needsMotion, setNeedsMotion] = useState(false);
  const [checkMs, setCheckMs] = useState<number | null>(null);
  const [selected, setSelected] = useState<FingerKey>("index");
  const [examples, setExamples] = useState(false);
  const [sentToDesktop, setSentToDesktop] = useState(false);

  const stage = useStage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // 2 good checks in a row, 3 s countdown, and a check may be up to 7 s old: over a tunnel (ngrok) one check takes 2 to 4 s
  const gateRef = useRef(new AutoCaptureGate(2, 3000, 7000));
  const levelRef = useRef<Level | null>(null);
  const observedAtRef = useRef(-Infinity);
  const noSensorRef = useRef(false);
  const capturingRef = useRef(false);
  const preFramesRef = useRef<HTMLCanvasElement[]>([]);
  const checkRef = useRef<[boolean, boolean, boolean]>([false, false, false]);
  const phaseRef = useRef<Phase>(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* load the session the QR code points to */
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    getSession(sessionId)
      .then((next) => {
        if (!alive) return;
        setSession(next);
        setPhase(next.complete ? "result" : "intro");
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message);
        setPhase("missing");
      });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  /* tell the desktop what this phone is doing ("Phone connected") */
  useEffect(() => {
    if (!sessionId) return;
    const send = () => {
      if (document.hidden) return;
      const p = phaseRef.current;
      const name = p === "intro" ? "guide" : p === "camera" ? "camera" : p === "processing" ? "processing" : null;
      if (name) publishActivity(sessionId, name).catch(() => {});
    };
    send();
    const timer = setInterval(send, 5000);
    return () => clearInterval(timer);
  }, [sessionId, phase]);

  /* camera, level sensor, live checks and automatic capture */
  useEffect(() => {
    if (phase !== "camera" || !sessionId) return;
    let alive = true;
    let inspecting = false;
    let missedChecks = 0;
    let maxSide = 960;
    let lastVideoTime = -1;
    let lastFrameAt = performance.now();
    let controller: AbortController | null = null;
    let activeCapture: { invalid: boolean } | null = null;
    const gate = gateRef.current;
    gate.reset();
    preFramesRef.current = [];
    checkRef.current = [false, false, false];
    noSensorRef.current = !matchMedia("(pointer:coarse)").matches;
    setCameraError(null);
    setChecks([false, false, false]);
    setCount(null);
    setLiveMessage("Starting the camera. Please hold still…");

    const angleOk = () => (noSensorRef.current ? true : captureAngleAllowed(levelRef.current, observedAtRef.current, performance.now()));
    const fail = (message: string) => {
      setError(message);
      setPhase("error");
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.() as { focusMode?: string[] } | undefined;
        if (capabilities?.focusMode?.includes("continuous")) {
          track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        }
        lastFrameAt = performance.now();
        setLiveMessage("Checking the hand and card. The photo is taken automatically.");
      } catch {
        if (alive) setCameraError("Camera unavailable. Allow camera access (this page needs https), then try again.");
      }
    })();

    const onOrientation = (e: DeviceOrientationEvent) => {
      const screenAngle = Number(screen.orientation?.angle || (window as unknown as { orientation?: number }).orientation || 0);
      const next = phoneLevel(e.beta ?? NaN, e.gamma ?? NaN, screenAngle);
      if (!next) return;
      noSensorRef.current = false;
      levelRef.current = next;
      observedAtRef.current = performance.now();
      if (activeCapture && next.angle > 3) activeCapture.invalid = true;
    };
    window.addEventListener("deviceorientation", onOrientation);

    const capture = async () => {
      const video = videoRef.current;
      const stream = streamRef.current;
      if (!video || !stream) return;
      if (
        !cameraCaptureAllowed({
          angleReady: angleOk(),
          streamReady: !!video.videoWidth,
          capturing: capturingRef.current,
          visible: !document.hidden,
          inspectionReady: gate.fresh(performance.now()),
        })
      )
        return;
      capturingRef.current = true;
      setTaking(true);
      const active = { invalid: false };
      activeCapture = active;
      try {
        const track = stream.getVideoTracks()[0];
        const frames = preFramesRef.current.slice(0, 2);
        const total = 3;
        preFramesRef.current = [];
        while (frames.length < total) {
          frames.push(frames.length === total - 1 ? await takeFrame(track, video) : canvasPhoto(video, video));
          if (!angleOk() || active.invalid || document.hidden) {
            gate.reset();
            setCount(null);
            return;
          }
          if (frames.length < total) await sleep(300);
        }
        setPhase("processing");
        let wake: WakeLockSentinel | undefined;
        try {
          wake = await navigator.wakeLock?.request("screen");
        } catch {
          /* optional */
        }
        try {
          const next = await measurePhoto(frames, sessionId);
          setSession(next);
          if (next.complete) setPhase("result");
          else fail("We couldn't measure this photo. Please try again.");
        } finally {
          await wake?.release().catch(() => {});
        }
      } catch (e) {
        fail((e as Error).message || "The photo could not be measured. Please try again.");
      } finally {
        activeCapture = null;
        capturingRef.current = false;
        setTaking(false);
      }
    };

    const tick = setInterval(() => {
      if (!alive) return;
      const now = performance.now();
      const angle = angleOk();
      const [c0, c1, c2] = checkRef.current;
      const shown = [c0, c1, angle && c2];
      setChecks((prev) => (same(prev, shown) ? prev : shown));
      // live level: the bubble moves 1 px per degree of tilt (3 degrees stays inside the small ring)
      const lvl = levelRef.current;
      if (lvl && now - observedAtRef.current <= 1000) {
        const distance = Math.min(45, lvl.angle);
        const magnitude = Math.hypot(lvl.x, lvl.y);
        const next = {
          x: magnitude ? Math.round((lvl.x / magnitude) * distance * 10) / 10 : 0,
          y: magnitude ? Math.round((lvl.y / magnitude) * distance * 10) / 10 : 0,
          angle: Math.round(lvl.angle * 10) / 10,
        };
        setBubble((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.angle === next.angle ? prev : next));
      } else setBubble(null);
      setNeedsMotion(!noSensorRef.current && now - observedAtRef.current > 2500);
      if (capturingRef.current || !streamRef.current) return;
      const step = gate.tick(now, angle && !document.hidden);
      setCount(step.remaining === null ? null : Math.max(1, step.remaining));
      if (step.remaining === null) preFramesRef.current = [];
      else if (step.leftMs > 0 && preFrameDue(step.leftMs, preFramesRef.current.length)) {
        try {
          const v = videoRef.current;
          if (v?.videoWidth) preFramesRef.current.push(canvasPhoto(v, v));
        } catch {
          /* the frame is taken again at capture time */
        }
      }
      if (step.fire) void capture();
    }, 100);

    const inspect = setInterval(async () => {
      const video = videoRef.current;
      if (!alive || !streamRef.current || inspecting || capturingRef.current || document.hidden) return;
      if (!video?.videoWidth || video.readyState < 2) return;
      const started = performance.now();
      controller = new AbortController();
      inspecting = true;
      try {
        const check = await inspectFrame(video, { signal: controller.signal, maxSide });
        if (!alive || capturingRef.current) return;
        const took = performance.now() - started;
        const stale = took > 6000;
        setCheckMs(Math.round(took / 100) / 10);
        const flags: [boolean, boolean, boolean] = [
          check.hand === true && check.card === true && check.framed === true && check.resolutionOK === true,
          check.spread === true,
          check.flat === true,
        ];
        checkRef.current = stale ? [false, false, false] : flags;
        if (!check.hand || !check.card) {
          missedChecks++;
          if (missedChecks >= 2) maxSide = 1280;
        } else missedChecks = 0;
        gate.observe(!stale && flags[0] && flags[1] && flags[2] && angleOk(), performance.now());
        setLiveMessage(stale ? "Live checks are catching up. Hold still." : liveCheckMessage(check));
      } catch {
        if (!alive) return;
        gate.reset();
        checkRef.current = [false, false, false];
        setLiveMessage("Live check unavailable. Keep your hand and card visible; retrying automatically.");
      } finally {
        inspecting = false;
      }
    }, 1500);

    const watchdog = setInterval(() => {
      const video = videoRef.current;
      if (!alive || !video || capturingRef.current || document.hidden) return;
      const now = performance.now();
      if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        lastFrameAt = now;
      } else if (streamRef.current && now - lastFrameAt > 6000) {
        setCameraKey((k) => k + 1);
      }
    }, 1000);

    return () => {
      alive = false;
      controller?.abort();
      clearInterval(tick);
      clearInterval(inspect);
      clearInterval(watchdog);
      window.removeEventListener("deviceorientation", onOrientation);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      gate.reset();
      preFramesRef.current = [];
    };
  }, [phase, sessionId, cameraKey]);

  const start = async () => {
    const note = await requestOrientation();
    setError(note);
    setCameraKey((k) => k + 1);
    setPhase("camera");
  };

  /* ------------------------------ screens ------------------------------ */

  if (phase === "loading") {
    return (
      <div className="oh-phone oh-phone-center">
        <div className="oh-spinner" aria-label="Loading" />
      </div>
    );
  }

  if (phase === "missing") {
    return (
      <div className="oh-phone oh-phone-center">
        <h1 className="oh-p-title">This link has expired</h1>
        <p className="oh-p-sub">{error ?? "Scan the QR code on your computer again to start a new measurement."}</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="oh-phone oh-phone-center">
        <h1 className="oh-p-title">Let&apos;s try that again</h1>
        <p className="oh-p-sub">{error ?? "The photo could not be measured."}</p>
        <button
          type="button"
          className="oh-p-btn"
          onClick={() => {
            setError(null);
            setCameraKey((k) => k + 1);
            setPhase("camera");
          }}
        >
          Retake photo
        </button>
      </div>
    );
  }

  const stageStyle = { transform: `translateX(-50%) scale(${stage.scale})`, top: stage.top };

  if (phase === "processing") {
    return (
      <div className="oh-phone">
        <div className="ohc-stage" style={stageStyle}>
          <div className="ohp-ring" aria-hidden />
          <h1 className="ohp-title">
            We&rsquo;re calculating
            <br />
            your size
          </h1>
          <p className="ohp-sub">This usually takes about 10 sec</p>
        </div>
      </div>
    );
  }

  if (phase === "result") {
    const view = session ? sizeRows(session) : null;
    if (!view) {
      return (
        <div className="oh-phone oh-phone-center">
          <h1 className="oh-p-title">We couldn&apos;t find a size</h1>
          <p className="oh-p-sub">Please try again with a clearer photo.</p>
          <button type="button" className="oh-p-btn" onClick={() => setPhase("intro")}>
            Start again
          </button>
        </div>
      );
    }
    return (
      <div className="oh-phone">
        <div className="ohc-stage" style={stageStyle}>
          <h1 className="ohr-title">Recommended size</h1>
          <div className="ohr-hand">
            <HandPhoto hand={view.hand} finger={selected} />
          </div>
          <div className="ohr-cards" role="radiogroup" aria-label="Finger">
            {view.rows.map((row) => {
              const on = row.finger === selected;
              return (
                <button
                  key={row.finger}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={row.size == null}
                  className={`ohr-card ${on ? "on" : ""}`}
                  onClick={() => setSelected(row.finger)}
                >
                  <span className="ohr-size">{row.display}</span>
                  <span className="ohr-finger">{row.label}</span>
                  <span className={`ohr-note ${row.outOfRange ? "warn" : ""}`}>{row.note}</span>
                  <span className={`velia-radio ohr-radio ${on ? "on" : ""}`} aria-hidden />
                </button>
              );
            })}
          </div>
          {sentToDesktop ? (
            <p className="ohr-done">Look at your computer to continue.</p>
          ) : (
            <button
              type="button"
              className="ohr-btn"
              onClick={() => {
                setSentToDesktop(true);
                if (sessionId) publishActivity(sessionId, "done").catch(() => {});
              }}
            >
              Continue on desktop
            </button>
          )}
        </div>
      </div>
    );
  }


  if (phase === "camera") {
    const looksGood = count !== null || taking;
    const levelOk = bubble ? bubble.angle <= 3 : !needsMotion;
    const items = ["Place your hand below the card", "Spread your fingers", "Lay your phone flat"];
    return (
      <div className="oh-phone oh-cam">
        <video ref={videoRef} className="oh-video" playsInline muted autoPlay />
        <div className="oh-shade" aria-hidden />
        <div className="ohc-stage" style={stageStyle}>
          <div className="ohc-zone" style={{ top: 71, height: 180 }} aria-hidden>
            <span>Card</span>
          </div>
          <div className="ohc-zone" style={{ top: 255, height: 313 }} aria-hidden>
            <span>Hand</span>
            {!looksGood && (
              <>
                <i className={`ohc-target ${levelOk ? "ok" : ""}`} />
                <i className="ohc-target-ring" />
                <i
                  className={`ohc-target-dot ${levelOk ? "ok" : ""}`}
                  style={{ transform: `translate(${bubble?.x ?? 0}px, ${bubble?.y ?? 0}px)` }}
                />
                {bubble && <div className="ohc-angle">{bubble.angle.toFixed(1)}° · max 3°{checkMs != null ? ` · check ${checkMs}s` : ""}</div>}
                {needsMotion && (
                  <button
                    type="button"
                    className="ohc-motion"
                    onClick={async () => {
                      const note = await requestOrientation();
                      if (note) setError(note);
                    }}
                  >
                    Enable motion sensor
                  </button>
                )}
              </>
            )}
          </div>
          {count !== null && (
            <div className="ohc-count" aria-live="assertive">
              {count}
            </div>
          )}
          {!looksGood && (
            <div className="ohc-hint" role="status">
              {liveMessage}
            </div>
          )}
          {looksGood ? (
            <div className="ohc-good">
              <RingDone size={20} />
              <p>Looks good! Stay still!</p>
            </div>
          ) : (
            items.map((text, i) => (
              <div key={text} className={`ohc-row ${checks[i] ? "on" : ""}`} style={{ top: 572 + i * 52 }}>
                <span className="ohc-icon">{checks[i] ? <RingDone size={20} /> : <RingPending />}</span>
                {text}
              </div>
            ))
          )}
          <PhotoSlot src={PHONE_THUMB_SRC} className="ohc-thumb">
            <HandIllustration card />
          </PhotoSlot>
        </div>
        {cameraError && (
          <div className="oh-cam-error" role="alert">
            <p>{cameraError}</p>
            <button type="button" className="oh-p-btn" onClick={() => setCameraKey((k) => k + 1)}>
              Restart camera
            </button>
          </div>
        )}
        {error && <div className="oh-cam-note" role="alert">{error}</div>}
        <button
          type="button"
          className="oh-cam-close"
          aria-label="Back"
          onClick={() => {
            setError(null);
            setPhase("intro");
          }}
        >
          ×
        </button>
      </div>
    );
  }

  /* intro */
  return (
    <div className="oh-phone oh-intro">
      <div className="ohc-stage" style={stageStyle}>
        <PhotoSlot src={PHONE_INTRO_SRC} className="ohi-art">
          <HandIllustration card />
        </PhotoSlot>
        <h1 className="ohi-title">Take a photo of your hand with a standard-size card</h1>
        <button type="button" className="ohi-examples" onClick={() => setExamples(true)}>
          See examples
        </button>
        <div className="ohi-note">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2171ff" strokeWidth="1.5" aria-hidden>
            <circle cx="12" cy="12" r="9.25" />
            <path d="M12 11v5.5" strokeLinecap="round" />
            <circle cx="12" cy="7.8" r=".6" fill="#2171ff" />
          </svg>
          <p>Nothing is scanned. We don&apos;t read or store any card data.</p>
        </div>
        <button type="button" className="ohi-start" onClick={start}>
          Start
        </button>
        {error && <p className="ohi-error">{error}</p>}
      </div>
      {examples && (
        <div className="ohi-sheet-scrim" role="presentation" onClick={() => setExamples(false)}>
          <div className="ohi-sheet" role="dialog" aria-modal="true" aria-label="Examples" onClick={(e) => e.stopPropagation()}>
            <h2>For a better photo</h2>
            <div className="oh-tips">
              {TIPS.map(([heading, copy]) => (
                <div key={heading}>
                  <b>{heading}</b>
                  <span>{copy}</span>
                </div>
              ))}
            </div>
            <button type="button" className="oh-p-btn" onClick={() => setExamples(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
