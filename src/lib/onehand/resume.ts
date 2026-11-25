/**
 * Keeps the desktop "Find your size" flow alive across a page reload (F5, dev-server hot reload).
 * Only small, non-personal values are kept in this tab's sessionStorage: which step is open,
 * the chosen gender / finger and the id of the QR session. No photos, no measurements.
 */
export const SIZING_OPEN_KEY = "velia.sizing.open";
export const SIZING_STATE_KEY = "velia.sizing.state";
export const PAIR_SESSION_KEY = "velia.onehand.session";

export function readJson<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the flow just won't survive a reload */
  }
}

export function clearSizingResume() {
  try {
    window.sessionStorage.removeItem(SIZING_OPEN_KEY);
    window.sessionStorage.removeItem(SIZING_STATE_KEY);
    window.sessionStorage.removeItem(PAIR_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
