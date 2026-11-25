"use client";

import { useEffect, useRef, useState } from "react";
import "./guide.css";
import { PhoneFlow } from "@/components/onehand/PhoneFlow";
import { QrCode } from "@/components/onehand/QrCode";
import { useIsMobile } from "@/lib/onehand/device";
import { PAIR_SESSION_KEY, readJson, writeJson } from "@/lib/onehand/resume";
import { createSession, getSession, type FingerKey, type Gender, type HandSide, type OneHandSession } from "@/lib/onehand/engine";

const ACTIVE_MS = 16000;
/** the guide plays once per page load; going back to this step does not replay it */
let guideShown = false;

const PHASE_TEXT: Record<string, string> = {
  guide: "Follow the steps on your phone.",
  camera: "Take the photo on your phone.",
  processing: "Measuring your fingers…",
};

/**
 * Desktop: creates the measurement session, shows its QR code, then
 * "Phone connected" as soon as the phone opens the link. Calls onComplete
 * when the phone has finished measuring.
 */
export function OneHandPair({
  gender,
  hand,
  onConnectedChange,
  onComplete,
  resume = false,
  reopenId,
  initialFinger,
  onRestart,
}: {
  gender: Gender;
  hand: HandSide;
  onConnectedChange: (connected: boolean) => void;
  onComplete: (session: OneHandSession, finger?: FingerKey) => void;
  /** after a page reload: keep the same QR session instead of creating a new one */
  resume?: boolean;
  /** phone: coming back from the methods page, open the finished measurement again instead of a new session */
  reopenId?: string;
  initialFinger?: FingerKey;
  /** phone: leaving the reopened sizes page, start again with a new session */
  onRestart?: () => void;
}) {
  const [session, setSession] = useState<OneHandSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  // the how-to guide plays first; skipping it shows the QR code (not after a reload: the customer is already scanning)
  const [guide, setGuide] = useState(!resume && !guideShown && !reopenId);
  const [reduceMotion, setReduceMotion] = useState(false);
  const mobile = useIsMobile();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  // on a phone the customer can measure right here, without scanning a QR code
  const [phoneOpen, setPhoneOpen] = useState(Boolean(reopenId));
  const localRef = useRef(Boolean(reopenId));
  const started = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const make = () =>
      createSession(hand, gender)
        .then((created) => {
          writeJson(PAIR_SESSION_KEY, { id: created.id, hand, gender });
          setSession(created);
        })
        .catch((e: Error) => setError(e.message));
    if (reopenId) {
      getSession(reopenId).then(setSession).catch(make);
      return;
    }
    const saved = resume ? readJson<{ id: string; hand: HandSide; gender: Gender }>(PAIR_SESSION_KEY) : null;
    if (saved && saved.hand === hand && saved.gender === gender) {
      getSession(saved.id).then(setSession).catch(make);
    } else {
      make();
    }
  }, [hand, gender, resume]);

  const id = session?.id ?? reopenId;
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => {
      getSession(id)
        .then((next) => {
          const live = !!next.activity && Date.now() - next.activity.at < ACTIVE_MS;
          if (live || next.processing || next.complete) setConnected(true);
          setPhase(next.processing ? "processing" : live ? next.activity!.phase : null);
          if (next.error) setError(next.error);
          if (next.complete && !doneRef.current && !localRef.current) {
            doneRef.current = true;
            onComplete(next);
          }
        })
        .catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [id, onComplete]);

  useEffect(() => onConnectedChange(connected), [connected, onConnectedChange]);

  useEffect(() => {
    setReduceMotion(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);

  if (phoneOpen && id) {
    return (
      <PhoneFlow
        sessionId={id}
        initialFinger={initialFinger}
        onExit={() => {
          if (reopenId) {
            onRestart?.();
            return;
          }
          localRef.current = false;
          setPhoneOpen(false);
        }}
        onDone={(done, finger) => {
          doneRef.current = true;
          onComplete(done, finger);
        }}
      />
    );
  }

  if (error && !session) {
    return (
      <div className="oh-center">
        <h1 className="velia-h1 oh-title">We couldn&apos;t start</h1>
        <p className="velia-desc oh-sub">{error}</p>
      </div>
    );
  }

  if (connected) {
    return (
      <div className="oh-center">
        <h1 className="velia-h1 oh-title">Phone connected</h1>
        <p className="velia-desc oh-sub">{(phase && PHASE_TEXT[phase]) || "Follow the steps on your phone."}</p>
        {error && <div className="msg amber oh-msg">{error}</div>}
      </div>
    );
  }

  if (guide && !ready) return null;

  if (guide && !mobile) {
    return (
      <div className="oh-guide">
        <video
          className="oh-guide-video"
          poster="/velia/guide/guide-poster.jpg"
          autoPlay={!reduceMotion}
          controls={reduceMotion}
          muted
          loop
          playsInline
          preload="auto"
          aria-label="Guide: how to measure your ring size, step by step"
        >
          <source src="/velia/guide/guide.webm" type="video/webm" />
          <source src="/velia/guide/guide.mp4" type="video/mp4" />
        </video>
        <p className="oh-guide-cap">A 40 second guide to the whole tool. You can skip it at any time.</p>
        <div className="oh-guide-actions">
          <button type="button" className="oh-guide-btn" onClick={() => {
              guideShown = true;
              setGuide(false);
            }}>
            Skip tutorial and scan the QR code
          </button>
        </div>
      </div>
    );
  }

  if (mobile) {
    return (
      <div className="oh-center">
        <h1 className="velia-h1 oh-title">Let&apos;s find your perfect size</h1>
        <p className="velia-desc oh-sub">
          Take a photo of your hand and a card with this phone.
          <br />
          It takes less than 2 minutes.
        </p>
        <div className="oh-guide-mobile">
          <button
            type="button"
            className="oh-guide-btn"
            disabled={!id}
            onClick={() => {
              localRef.current = true;
              setPhoneOpen(true);
            }}
          >
            {id ? "Continue on this phone" : "Getting ready…"}
          </button>
        </div>
        {error && <div className="msg amber oh-msg">{error}</div>}
      </div>
    );
  }

  const base = (process.env.NEXT_PUBLIC_PUBLIC_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  const local = /^https?:\/\/(localhost|127\.|\[::1\])/.test(base);
  const url = id ? `${base}/m?s=${id}` : "";

  return (
    <div className="oh-center">
      <h1 className="velia-h1 oh-title">Let&apos;s find your perfect size</h1>
      <p className="velia-desc oh-sub">
        Find your perfect size for this ring with our AI Virtual Sizer.
        <br />
        Scan the QR and follow the steps, it takes less than 2 minutes.
      </p>
      {url ? <QrCode value={url} /> : <div className="oh-qr oh-qr-wait" aria-busy="true" />}
      <button type="button" className="oh-guide-again" onClick={() => setGuide(true)}>
        Watch the guide again
      </button>
      {local && (
        <div className="msg amber oh-msg">
          This address only works on this computer. Open the site through its public https address (or set NEXT_PUBLIC_PUBLIC_URL) so the QR code opens on your phone.
        </div>
      )}
    </div>
  );
}
