"use client";

import { useEffect, useState } from "react";

type QrMaker = {
  addData: (text: string) => void;
  make: () => void;
  createSvgTag: (options: { cellSize: number; margin: number; scalable: boolean }) => string;
};
declare global {
  interface Window {
    qrcode?: (typeNumber: number, level: string) => QrMaker;
  }
}

let loading: Promise<void> | null = null;

/** QR generator by Kazuhiko Arase (MIT), served from /vendor/qrcode.js. No npm dependency. */
function loadQrLib(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.qrcode) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/qrcode.js";
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("QR code library could not be loaded."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function QrCode({ value, size = 232 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadQrLib()
      .then(() => {
        if (!alive || !window.qrcode) return;
        const qr = window.qrcode(0, "M");
        qr.addData(value);
        qr.make();
        setSvg(qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }));
      })
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [value]);

  return (
    <div
      className="oh-qr"
      style={{ width: size, height: size }}
      role="img"
      aria-label="QR code. Scan it with your phone to continue."
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
