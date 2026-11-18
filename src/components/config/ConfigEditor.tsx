"use client";

import { useCallback, useEffect, useState } from "react";

const FINGERS = ["thumb", "index", "middle", "ring", "little"] as const;
const LIMITS = ["u6", "u8", "u10", "u12"] as const;
type Gender = "male" | "female";
type Cfg = {
  offsets: Record<(typeof FINGERS)[number], number>;
  u6: number;
  u8: number;
  u10: number;
  u12: number;
  borderlineMm: number;
};
type Both = Record<Gender, Cfg>;
type Draft = Record<Gender, { offsets: Record<string, string>; u6: string; u8: string; u10: string; u12: string; borderlineMm: string }>;

const toDraft = (c: Both): Draft => {
  const one = (x: Cfg) => ({
    offsets: Object.fromEntries(FINGERS.map((f) => [f, String(x.offsets[f])])),
    u6: String(x.u6),
    u8: String(x.u8),
    u10: String(x.u10),
    u12: String(x.u12),
    borderlineMm: String(x.borderlineMm),
  });
  return { male: one(c.male), female: one(c.female) };
};
const toNumbers = (d: Draft[Gender]): Cfg => ({
  offsets: Object.fromEntries(FINGERS.map((f) => [f, Number(d.offsets[f])])) as Cfg["offsets"],
  u6: Number(d.u6),
  u8: Number(d.u8),
  u10: Number(d.u10),
  u12: Number(d.u12),
  borderlineMm: Number(d.borderlineMm),
});

const PIN_KEY = "velia.config.pin";
const label = (s: string) => (s === "u6" ? "US 6 limit" : s === "u8" ? "US 8 limit" : s === "u10" ? "US 10 limit" : s === "u12" ? "US 12 limit" : s[0].toUpperCase() + s.slice(1));

export function ConfigEditor() {
  const [pin, setPin] = useState("");
  const [needPin, setNeedPin] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [defaults, setDefaults] = useState<Both | null>(null);
  const [tab, setTab] = useState<Gender>("male");
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = useCallback((p: string): HeadersInit => ({ "content-type": "application/json", ...(p ? { "x-config-pin": p } : {}) }), []);

  const load = useCallback(
    async (p: string) => {
      const res = await fetch("/api/config", { headers: headers(p), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setNeedPin(true);
        if (p) setNote({ text: "Wrong PIN.", bad: true });
        return;
      }
      if (!res.ok) {
        setNeedPin(false);
        setNote({ text: data.error ?? "Could not load the settings.", bad: true });
        return;
      }
      setNeedPin(false);
      setNote(null);
      try {
        sessionStorage.setItem(PIN_KEY, p);
      } catch {}
      setDraft(toDraft(data.active));
      setDefaults(data.defaults);
    },
    [headers],
  );

  useEffect(() => {
    let saved = "";
    try {
      saved = sessionStorage.getItem(PIN_KEY) ?? "";
    } catch {}
    setPin(saved);
    load(saved);
  }, [load]);

  const edit = (g: Gender, fn: (d: Draft[Gender]) => void) =>
    setDraft((cur) => {
      if (!cur) return cur;
      const next = structuredClone(cur);
      fn(next[g]);
      return next;
    });

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: headers(pin),
      body: JSON.stringify({ male: toNumbers(draft.male), female: toNumbers(draft.female) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNote({ text: data.error ?? "Could not save.", bad: true });
    setDraft(toDraft(data.active));
    setNote({ text: "Saved. The next measurement uses these values." });
  };

  const reset = async () => {
    setBusy(true);
    const res = await fetch("/api/config", { method: "POST", headers: headers(pin), body: JSON.stringify({ gender: tab }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNote({ text: data.error ?? "Could not reset.", bad: true });
    setDraft(toDraft(data.active));
    setNote({ text: `${tab === "male" ? "Male" : "Female"} is back to its default values.` });
  };

  const other: Gender = tab === "male" ? "female" : "male";
  const d = draft?.[tab];

  return (
    <main className="cfg">
      <h1>One-hand settings</h1>
      <p className="cfg-lead">
        These values are used only by the one-hand measurement (one photo of the back of the hand). A change applies to the next measurement
        straight away. Male and female can have different values: pick the tab, edit, then Save (both tabs are saved together).
      </p>

      {needPin && (
        <form
          className="cfg-card cfg-pin"
          onSubmit={(e) => {
            e.preventDefault();
            load(pin);
          }}
        >
          <h2>Enter the PIN</h2>
          <p>This page is protected when opened through a public address.</p>
          <div className="cfg-row">
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus aria-label="PIN" />
            <button type="submit" className="cfg-btn dark">Open</button>
          </div>
        </form>
      )}

      {note && <div className={`cfg-note ${note.bad ? "bad" : ""}`}>{note.text}</div>}

      {d && defaults && (
        <>
          <div className="cfg-tabs">
            {(["male", "female"] as const).map((g) => (
              <button key={g} type="button" className={`cfg-tab ${tab === g ? "on" : ""}`} onClick={() => setTab(g)}>
                {g === "male" ? "Male" : "Female"}
              </button>
            ))}
            <button
              type="button"
              className="cfg-tab"
              onClick={() => {
                setDraft((cur) => (cur ? { ...cur, [other]: structuredClone(cur[tab]) } : cur));
                setNote({ text: `Copied to ${other}. Press Save to keep it.` });
              }}
            >
              Copy these values to {other}
            </button>
          </div>

          <section className="cfg-card">
            <h2>Offsets (mm)</h2>
            <p>C = π × W − offset, one value per finger.</p>
            <div className="cfg-grid five">
              {FINGERS.map((f) => (
                <label key={f}>
                  <span>{label(f)}</span>
                  <input inputMode="decimal" value={d.offsets[f]} onChange={(e) => edit(tab, (x) => (x.offsets[f] = e.target.value))} />
                </label>
              ))}
            </div>
          </section>

          <section className="cfg-card">
            <h2>Size limits (mm)</h2>
            <p>A finger below the US 6 limit is US 6, between US 6 and US 8 is US 8, and so on. Above the US 12 limit there is no size.</p>
            <div className="cfg-grid four">
              {LIMITS.map((k) => (
                <label key={k}>
                  <span>{label(k)}</span>
                  <input inputMode="decimal" value={d[k]} onChange={(e) => edit(tab, (x) => (x[k] = e.target.value))} />
                </label>
              ))}
            </div>
          </section>

          <section className="cfg-card">
            <h2>Borderline distance (mm)</h2>
            <p>A finger closer than this to the top of its size also shows the next larger size (never a smaller one). 0 turns it off.</p>
            <div className="cfg-grid one">
              <label>
                <span>Distance</span>
                <input inputMode="decimal" value={d.borderlineMm} onChange={(e) => edit(tab, (x) => (x.borderlineMm = e.target.value))} />
              </label>
            </div>
          </section>

          <div className="cfg-actions">
            <button type="button" className="cfg-btn dark" disabled={busy} onClick={save}>Save</button>
            <button type="button" className="cfg-btn" disabled={busy} onClick={reset}>
              Reset {tab} to defaults
            </button>
          </div>
        </>
      )}
    </main>
  );
}
