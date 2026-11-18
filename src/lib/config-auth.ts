import { timingSafeEqual } from "node:crypto";

/** Base URL of the sizing service (onehand-service/). */
export const SERVICE = (process.env.ONEHAND_SERVICE_URL || "http://127.0.0.1:4185").replace(/\/$/, "");

const fails = new Map<string, { n: number; at: number }>();

/** True only for a browser on the machine running the app (not through a tunnel or proxy). */
export function isLocalRequest(headers: Headers): boolean {
  const host = headers.get("host") ?? "";
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) && !headers.get("x-forwarded-for");
}

export type AuthResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Settings are measurement-algorithm values, so they are never open to the internet:
 * - on the computer running the app: open;
 * - through ngrok or any other address: CONFIG_PIN (env) must be set and sent in `x-config-pin`.
 */
export function authorize(headers: Headers): AuthResult {
  if (isLocalRequest(headers)) return { ok: true };
  const pin = process.env.CONFIG_PIN;
  if (!pin || pin.length < 6) {
    return { ok: false, status: 403, error: "Remote access is off. Set CONFIG_PIN (6+ characters) in .env.local and restart." };
  }
  const id = (headers.get("x-forwarded-for") ?? "remote").split(",")[0].trim();
  const f = fails.get(id);
  if (f && f.n >= 5 && Date.now() - f.at < 10 * 60_000) {
    return { ok: false, status: 429, error: "Too many wrong PINs. Try again in 10 minutes." };
  }
  const given = Buffer.from(headers.get("x-config-pin") ?? "");
  const want = Buffer.from(pin);
  if (given.length === want.length && timingSafeEqual(given, want)) {
    fails.delete(id);
    return { ok: true };
  }
  if (headers.get("x-config-pin")) {
    fails.set(id, { n: (f && Date.now() - f.at < 10 * 60_000 ? f.n : 0) + 1, at: Date.now() });
  }
  return { ok: false, status: 401, error: "PIN required." };
}
