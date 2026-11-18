"use client";

import { useEffect, useRef, useState } from "react";
import { QrCode } from "@/components/onehand/QrCode";
import { createSession, getSession, type Gender, type HandSide, type OneHandSession } from "@/lib/onehand/engine";

const ACTIVE_MS = 16000;

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
}: {
  gender: Gender;
  hand: HandSide;
  onConnectedChange: (connected: boolean) => void;
  onComplete: (session: OneHandSession) => void;
}) {
  const [session, setSession] = useState<OneHandSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const started = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    createSession(hand, gender)
      .then(setSession)
      .catch((e: Error) => setError(e.message));
  }, [hand, gender]);

  const id = session?.id;
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => {
      getSession(id)
        .then((next) => {
          const live = !!next.activity && Date.now() - next.activity.at < ACTIVE_MS;
          if (live || next.processing || next.complete) setConnected(true);
          setPhase(next.processing ? "processing" : live ? next.activity!.phase : null);
          if (next.error) setError(next.error);
          if (next.complete && !doneRef.current) {
            doneRef.current = true;
            onComplete(next);
          }
        })
        .catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [id, onComplete]);

  useEffect(() => onConnectedChange(connected), [connected, onConnectedChange]);

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
      {local && (
        <div className="msg amber oh-msg">
          This address only works on this computer. Open the site through its public https address (or set NEXT_PUBLIC_PUBLIC_URL) so the QR code opens on your phone.
        </div>
      )}
    </div>
  );
}
