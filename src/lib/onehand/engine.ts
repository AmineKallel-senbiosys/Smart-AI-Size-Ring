/**
 * Client for the one-hand measurement service (onehand-service/).
 *
 * The browser talks to the Next.js app only: next.config.ts rewrites
 *   /api/inspect, /api/session[/...]  ->  the Node service (default http://127.0.0.1:4185).
 * Logic ported from the validated /onehand pages (hand-engine.js, camera-guidance.mjs,
 * auto-capture.mjs, camera-recovery.mjs, capture-frame.mjs) without changing thresholds.
 */

export type HandSide = "left" | "right";
export type Gender = "male" | "female";
export type FingerKey = "little" | "ring" | "middle" | "index" | "thumb";

export type FingerSize = {
  size: number | null;
  status: string;
  also: number | null;
};

export type OneHandSession = {
  id: string;
  complete: boolean;
  completed: string[];
  next: { key: string; side: HandSide; surface: string } | null;
  sizes: Record<HandSide, Record<FingerKey, FingerSize> | null> | null;
  processing: boolean;
  error: string | null;
  activity: { phase: string; at: number } | null;
  validated: boolean;
  skipped: boolean;
};

export type LiveCheck = {
  hand?: boolean;
  card?: boolean;
  spread?: boolean;
  flat?: boolean;
  framed?: boolean;
  pixelScale?: number;
  resolutionOK?: boolean;
};

/* ------------------------------ HTTP ------------------------------ */

function explain(status: number, text: string): string {
  const ngrok = text.match(/ERR_NGROK_\d+/);
  if (ngrok) return `ngrok blocked this request (${ngrok[0]}). Check the ngrok dashboard for this error code.`;
  if (/ngrok/i.test(text)) return "ngrok showed its own page instead of the app. Reload the page and accept the ngrok notice.";
  if (status === 404 || status === 405 || status === 502 || status === 500)
    return "The measurement service is not reachable. Start it with `npm run onehand` and try again.";
  return `The server returned an unexpected reply (HTTP ${status}${text ? ": " + text.replace(/\s+/g, " ").slice(0, 80) : ""}).`;
}

export async function fetchJSON<T>(
  url: string,
  init?: RequestInit,
  { timeoutMs = 600000, signal, timeoutMessage = "The request took too long. Please retry." }: { timeoutMs?: number; signal?: AbortSignal; timeoutMessage?: string } = {},
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      headers: { "ngrok-skip-browser-warning": "1", ...(init?.headers ?? {}) },
      signal: controller.signal,
      cache: "no-store",
    });
    let data: { error?: string } & Record<string, unknown>;
    let text = "";
    try {
      text = await response.clone().text();
      data = JSON.parse(text);
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error(explain(response.status, text));
    }
    if (!response.ok) throw new Error(data.error || "The photo could not be measured.");
    return data as T;
  } catch (error) {
    if (timedOut) throw new Error(timeoutMessage);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

export const createSession = (hand: HandSide, gender: Gender) =>
  fetchJSON<OneHandSession>(
    "/api/session",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "onehand", hand, gender }) },
    { timeoutMs: 15000 },
  );

export const getSession = (id: string) => fetchJSON<OneHandSession>(`/api/session/${id}`, {}, { timeoutMs: 15000 });

export const publishActivity = (id: string, phase: string) =>
  fetchJSON<OneHandSession>(
    `/api/session/${id}/activity`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase }) },
    { timeoutMs: 8000 },
  );

/* --------------------------- image encoding --------------------------- */

export type Crop = { x: number; y: number; width: number; height: number };

export function coverCrop(width: number, height: number, displayWidth: number, displayHeight: number): Crop {
  if (![width, height, displayWidth, displayHeight].every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error("Invalid camera dimensions");
  }
  const target = displayWidth / displayHeight;
  const source = width / height;
  const cropWidth = source > target ? height * target : width;
  const cropHeight = source > target ? height : width / target;
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

type Drawable = HTMLVideoElement | HTMLCanvasElement | ImageBitmap;

function dims(source: Drawable) {
  const video = source as HTMLVideoElement;
  return { w: video.videoWidth || (source as HTMLCanvasElement).width, h: video.videoHeight || (source as HTMLCanvasElement).height };
}

function frameHasPixels(data: Uint8ClampedArray): boolean {
  let maximum = 0;
  let total = 0;
  let count = 0;
  const stride = Math.max(1, Math.floor(data.length / 4 / 12000)) * 4;
  for (let i = 0; i < data.length; i += stride) {
    const value = Math.max(data[i], data[i + 1], data[i + 2]);
    maximum = Math.max(maximum, value);
    total += value;
    count++;
  }
  return count > 0 && maximum > 8 && total / count > 1;
}

/** Materialise the pixels while the camera is live (avoids black frames on mobile browsers). */
export function freezeFrame(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("The photo could not be read.");
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (!frameHasPixels(pixels.data)) throw new Error("The camera returned a black frame. Keep the camera open and retry.");
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

function drawCropped(source: Drawable, box: { width: number; height: number }, limit: number) {
  const { w, h } = dims(source);
  if (!w || !h) throw new Error("The photo could not be read.");
  const crop = coverCrop(w, h, box.width, box.height);
  const ratio = Math.min(1, limit / Math.max(crop.width, crop.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.width * ratio);
  canvas.height = Math.round(crop.height * ratio);
  canvas.getContext("2d")?.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return { canvas, crop, ratio };
}

/** One camera frame as a canvas, cropped to what the user sees on screen (max 2400 px). */
export function canvasPhoto(source: Drawable, video: HTMLVideoElement): HTMLCanvasElement {
  const box = video.getBoundingClientRect();
  return freezeFrame(drawCropped(source, box, 2400).canvas);
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The camera frame could not be encoded. Please restart the camera."))), "image/jpeg", 0.92),
  );

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("The photo could not be read."));
    reader.readAsDataURL(blob);
  });

/** Send the (three) frames; the server takes the median width per finger. */
export async function measurePhoto(frames: HTMLCanvasElement[], sessionId: string): Promise<OneHandSession> {
  const encoded: string[] = [];
  for (const canvas of frames) encoded.push(await blobToBase64(await toBlob(canvas)));
  return fetchJSON<OneHandSession>(
    `/api/session/${sessionId}/measure`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frames: encoded }) },
    { timeoutMs: 300000, timeoutMessage: "Measurement timed out. Please retry with a clear photo." },
  );
}

/** Live check of the camera view (hand, card, spread, flat, framed). */
export async function inspectFrame(video: HTMLVideoElement, options: { signal?: AbortSignal; maxSide?: number } = {}): Promise<LiveCheck> {
  const { canvas, crop, ratio } = drawCropped(video, video.getBoundingClientRect(), options.maxSide || 960);
  const blob = await toBlob(canvas);
  const data = await fetchJSON<LiveCheck>(
    "/api/inspect",
    { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob },
    { timeoutMs: 15000, signal: options.signal, timeoutMessage: "The camera check took too long. Retrying automatically; hold the phone steady." },
  );
  if (data.pixelScale) {
    data.resolutionOK = (data.pixelScale * Math.min(1, 2400 / Math.max(crop.width, crop.height))) / ratio >= 3;
  }
  return data;
}

/* ------------------------- level / auto-capture ------------------------- */

export type Level = { angle: number; x: number; y: number };

export function phoneLevel(beta: number, gamma: number, screenAngle = 0): Level | null {
  if (![beta, gamma, screenAngle].every(Number.isFinite)) return null;
  const b = (beta * Math.PI) / 180;
  const g = (gamma * Math.PI) / 180;
  const a = (screenAngle * Math.PI) / 180;
  const z = Math.cos(b) * Math.cos(g);
  const angle = (Math.acos(Math.min(1, Math.abs(z))) * 180) / Math.PI;
  const gx = Math.sin(g);
  const gy = Math.sin(b) * Math.cos(g);
  const x = gx * Math.cos(a) + gy * Math.sin(a);
  const y = -gx * Math.sin(a) + gy * Math.cos(a);
  return { angle, x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}

export const MAX_CAPTURE_TILT = 3;
export const MAX_ORIENTATION_AGE_MS = 1000;

export function captureAngleAllowed(level: Level | null, observedAt: number, now: number): boolean {
  return (
    !!level &&
    Number.isFinite(level.angle) &&
    level.angle >= 0 &&
    level.angle <= MAX_CAPTURE_TILT &&
    Number.isFinite(observedAt) &&
    now >= observedAt &&
    now - observedAt <= MAX_ORIENTATION_AGE_MS
  );
}

export class AutoCaptureGate {
  private good = 0;
  private lastInspection = -Infinity;
  private started: number | null = null;
  private triggered = false;
  constructor(private checks = 2, private countdownMs = 3000, private maxAge = 2500) {}
  reset() {
    this.good = 0;
    this.lastInspection = -Infinity;
    this.started = null;
    this.triggered = false;
  }
  observe(good: boolean, now: number) {
    if (!good) {
      this.reset();
      return;
    }
    this.good++;
    this.lastInspection = now;
  }
  fresh(now: number) {
    return this.good >= this.checks && now >= this.lastInspection && now - this.lastInspection <= this.maxAge;
  }
  tick(now: number, angleReady: boolean): { remaining: number | null; fire: boolean; leftMs: number } {
    if (!angleReady || (this.good > 0 && now - this.lastInspection > this.maxAge)) {
      this.reset();
      return { remaining: null, fire: false, leftMs: 0 };
    }
    if (!this.fresh(now) || this.triggered) return { remaining: null, fire: false, leftMs: 0 };
    if (this.started === null) this.started = now;
    const leftMs = this.countdownMs - (now - this.started);
    const remaining = Math.ceil(leftMs / 1000);
    if (remaining <= 0) {
      this.triggered = true;
      return { remaining: 0, fire: true, leftMs: 0 };
    }
    return { remaining, fire: false, leftMs };
  }
}

/** The three photos are taken at 1.5 s, 0.75 s and 0 s before the end of the countdown. */
export const preFrameDue = (leftMs: number, taken: number) => (taken === 0 && leftMs <= 1500) || (taken === 1 && leftMs <= 750);

export function cameraCaptureAllowed(o: { angleReady: boolean; streamReady: boolean; capturing: boolean; visible: boolean; inspectionReady: boolean }) {
  return !!(o.angleReady && o.streamReady && !o.capturing && o.visible && o.inspectionReady);
}

export function liveCheckMessage(check: LiveCheck): string {
  if (!check.hand) return "No hand detected. Show the whole hand and all five fingers.";
  if (!check.card) return "Card not detected. Keep all four edges visible above the fingertips.";
  if (!check.framed) return "Keep the whole hand and card away from the edges of the camera view.";
  if (!check.resolutionOK) return "Move the phone a little closer while keeping the whole hand and card visible.";
  if (!check.spread) return "Separate your fingers gently so their edges do not touch.";
  if (!check.flat) return "Keep the reference card flat and photograph it directly from above.";
  return "Position checks passed. Hold still and keep the phone at 3° or less.";
}

/* ------------------------------ sizes view ------------------------------ */

export const FINGER_LABEL: Record<FingerKey, string> = {
  index: "Index finger",
  middle: "Middle finger",
  ring: "Ring finger",
  little: "Little finger",
  thumb: "Thumb",
};

/** Order used on screen (matches the Figma list). */
export const FINGER_ORDER: FingerKey[] = ["index", "middle", "ring", "little", "thumb"];

export type SizeRow = {
  finger: FingerKey;
  label: string;
  size: number | null;
  /** big text: "6", or "–" when we have no size */
  display: string;
  note: string;
  bestFit: boolean;
  outOfRange: boolean;
};

/**
 * Turns the service reply into the rows shown on phone and desktop.
 * "Best fit" marks the fingers that match the most common size among the four
 * fingers other than the thumb (the thumb is the least reliable measurement).
 */
export function sizeRows(session: OneHandSession): { hand: HandSide; rows: SizeRow[] } | null {
  const hand = (["right", "left"] as const).find((side) => session.sizes?.[side]);
  const sizes = hand ? session.sizes?.[hand] : null;
  if (!hand || !sizes) return null;
  const counts = new Map<number, number>();
  for (const finger of FINGER_ORDER) {
    const s = sizes[finger]?.size;
    if (finger !== "thumb" && s != null) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
  const rows = FINGER_ORDER.map((finger): SizeRow => {
    const r = sizes[finger];
    const outOfRange = /-range$/.test(r?.status ?? "");
    let note = "Should feel comfortable.";
    if (r?.size == null) {
      note =
        r?.status === "above-range"
          ? "US 12 is too small. We don't have your size."
          : r?.status === "below-range"
            ? "US 6 is too big. We don't have your size."
            : r?.status === "not-measured"
              ? "Not measured."
              : "Outside sizes 6 to 12.";
    } else if (r.also) note = `Between ${r.size} and ${r.also}. Should feel comfortable.`;
    return {
      finger,
      label: FINGER_LABEL[finger],
      size: r?.size ?? null,
      display: r?.size != null ? String(r.size) : "–",
      note,
      bestFit: finger !== "thumb" && r?.size != null && r.size === top,
      outOfRange,
    };
  });
  return { hand, rows };
}
