"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isMobileDevice } from "@/lib/mobile";

export type CameraStatus =
  | "idle"
  | "requesting"
  | "live"
  | "denied"
  | "unsupported"
  | "error";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (typeof window === "undefined") return;

    const secure =
      window.isSecureContext ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1";

    if (!secure || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setError(
        secure
          ? "Camera API not available in this browser."
          : "Camera needs HTTPS. Open this app via your ngrok https:// link — Safari blocks camera on plain http:// pages."
      );
      return;
    }

    setStatus("requesting");
    setError(null);
    if (streamRef.current) stop();

    const mobile = isMobileDevice();

    const constraints: MediaStreamConstraints[] = mobile
      ? [
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280, max: 1280 },
              height: { ideal: 720, max: 720 },
              frameRate: { ideal: 15, max: 24 },
            },
          },
          { audio: false, video: { facingMode: "environment" } },
          { audio: false, video: true },
        ]
      : [
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920, max: 1920 },
              height: { ideal: 1080, max: 1080 },
              frameRate: { ideal: 24, max: 30 },
            },
          },
        ];

    try {
      let stream: MediaStream | null = null;
      let lastErr: unknown;
      for (const c of constraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!stream) throw lastErr ?? new Error("Could not open the camera.");
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        try {
          await video.play();
        } catch {
          /* iOS may require a second play() after metadata */
          await new Promise((r) => {
            video.onloadedmetadata = () => r(undefined);
          });
          await video.play();
        }
      }
      setStatus("live");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setStatus("denied");
        setError("Camera permission denied. Enable it in Safari settings.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setStatus("error");
        setError("No camera found on this device.");
      } else {
        setStatus("error");
        setError(
          err instanceof Error ? err.message : "Could not open the camera."
        );
      }
    }
  }, [stop]);

  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const mobile = isMobileDevice();
    const maxW = mobile ? 1600 : 1920;
    const scale = Math.min(1, maxW / (video.videoWidth || maxW));
    const w = Math.round((video.videoWidth || 1280) * scale);
    const h = Math.round((video.videoHeight || 720) * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", mobile ? 0.9 : 0.92);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, status, error, start, stop, capture };
}
