"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isIOS, isMobileDevice } from "@/lib/mobile";

export type CameraStatus =
  | "idle"
  | "requesting"
  | "live"
  | "denied"
  | "unsupported"
  | "error";

export type CapturedPhoto = {
  dataUrl: string;
  width: number;
  height: number;
  /** native = iOS system camera; sensor = ImageCapture; frame = video grab */
  source: "native" | "sensor" | "frame";
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlDimensions(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function photoPixels(photo: CapturedPhoto) {
  return photo.width * photo.height;
}

/** iOS Safari: only the system camera returns full 12–48 MP stills. */
function pickNativePhoto(): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.style.display = "none";

    const finish = (photo: CapturedPhoto | null) => {
      input.remove();
      resolve(photo);
    };

    input.addEventListener(
      "change",
      async () => {
        const file = input.files?.[0];
        if (!file) {
          finish(null);
          return;
        }
        try {
          const dataUrl = await blobToDataUrl(file);
          const { width, height } = await dataUrlDimensions(dataUrl);
          if (!width || !height) {
            finish(null);
            return;
          }
          finish({ dataUrl, width, height, source: "native" });
        } catch {
          finish(null);
        }
      },
      { once: true }
    );

    document.body.appendChild(input);
    input.click();
  });
}

async function waitForVideoResolution(
  video: HTMLVideoElement,
  minW: number,
  minH: number,
  timeoutMs = 1500
): Promise<void> {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (
        video.videoWidth >= minW * 0.9 &&
        video.videoHeight >= minH * 0.9
      ) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function boostTrackResolution(
  video: HTMLVideoElement,
  track: MediaStreamTrack
): Promise<void> {
  const caps = track.getCapabilities?.();
  const maxW = caps?.width?.max;
  const maxH = caps?.height?.max;
  if (!maxW || !maxH) return;

  const targets = [
    { w: maxW, h: maxH },
    { w: 4032, h: 3024 },
    { w: 3840, h: 2160 },
    { w: 3024, h: 4032 },
    { w: 2560, h: 1440 },
    { w: 1920, h: 1080 },
  ].filter((t) => t.w <= maxW && t.h <= maxH);

  for (const { w, h } of targets) {
    try {
      await track.applyConstraints({
        width: { ideal: w },
        height: { ideal: h },
      });
      await waitForVideoResolution(video, w, h);
      if (video.videoWidth * video.videoHeight >= w * h * 0.75) return;
    } catch {
      continue;
    }
  }
}

async function captureFromSensor(
  track: MediaStreamTrack
): Promise<CapturedPhoto | null> {
  if (typeof ImageCapture === "undefined") return null;

  const ic = new ImageCapture(track);
  const attempts: (PhotoSettings | undefined)[] = [undefined];

  try {
    const caps = await ic.getPhotoCapabilities();
    const maxW = caps.imageWidth?.max;
    const maxH = caps.imageHeight?.max;
    if (maxW) attempts.push({ imageWidth: maxW });
    if (maxH) attempts.push({ imageHeight: maxH });
    if (maxW && maxH) {
      attempts.push({ imageWidth: maxW, imageHeight: maxH });
      attempts.push({ imageWidth: 4032, imageHeight: 3024 });
      attempts.push({ imageWidth: 3024, imageHeight: 4032 });
    }
  } catch {
    /* optional */
  }

  let best: CapturedPhoto | null = null;

  for (const settings of attempts) {
    try {
      const blob = await ic.takePhoto(settings);
      if (!blob.size) continue;
      const dataUrl = await blobToDataUrl(blob);
      const { width, height } = await dataUrlDimensions(dataUrl);
      if (!width || !height) continue;
      const shot: CapturedPhoto = {
        dataUrl,
        width,
        height,
        source: "sensor",
      };
      if (!best || photoPixels(shot) > photoPixels(best)) best = shot;
      if (photoPixels(shot) >= 10_000_000) break;
    } catch {
      continue;
    }
  }

  return best;
}

function captureFromVideoFrame(video: HTMLVideoElement): CapturedPhoto | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);

  const mobile = isMobileDevice();
  return {
    dataUrl: canvas.toDataURL("image/jpeg", mobile ? 0.96 : 0.97),
    width: w,
    height: h,
    source: "frame",
  };
}

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
              width: { ideal: 4032 },
              height: { ideal: 3024 },
              frameRate: { ideal: 24, max: 30 },
            },
          },
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 3840 },
              height: { ideal: 2160 },
              frameRate: { ideal: 24, max: 30 },
            },
          },
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
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
              width: { ideal: 4032 },
              height: { ideal: 3024 },
              frameRate: { ideal: 30, max: 30 },
            },
          },
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 3840 },
              height: { ideal: 2160 },
              frameRate: { ideal: 30, max: 30 },
            },
          },
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
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
        setError("Camera permission denied. Enable Safari settings.");
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

  const capture = useCallback(async (): Promise<CapturedPhoto | null> => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || video.readyState < 2) return null;

    const track = stream?.getVideoTracks()[0];

    // iOS Safari cannot exceed ~4K from getUserMedia — use the system camera.
    if (isIOS()) {
      const native = await pickNativePhoto();
      if (native) return native;
    }

    if (track) await boostTrackResolution(video, track);

    let best: CapturedPhoto | null = null;

    if (track) {
      const sensorShot = await captureFromSensor(track);
      if (sensorShot) best = sensorShot;
    }

    const frameShot = captureFromVideoFrame(video);
    if (
      frameShot &&
      (!best || photoPixels(frameShot) > photoPixels(best))
    ) {
      best = frameShot;
    }

    return best;
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, status, error, start, stop, capture };
};
