// Ear & Pen: merging this device's data with the cloud copy.
// Pure functions (no browser APIs), so they run the same in the page and in tests.
//
// The synced data is one object:
//   prefs     level, topic, voices, speed…  — the newer copy wins (prefsTs)
//   tr        translation queue and position — the newer copy wins (trTs)
//   history   results of every exercise     — union of both devices
//   mistakes  saved mistakes                — union of both devices
//   dialogs   dialogues written by Claude   — union of both devices
//   rev       review schedule per card      — per card, the latest review wins (last)
//   days      days the daily goal was met   — union of both devices (for the streak)
//   words     phrase cards from dialogues   — union of both devices (earliest "added" kept)
//   cleared   "clear history" time          — anything older is dropped everywhere

export const SYNC_V = 1;

export const histKey = h => `${h.t}:${h.k}:${h.p}`;
export const mistKey = m => `${m.t}:${m.kind}:${m.yours}:${m.better}`;
export const dlgKey = d => d.id || `${d.title}|${(d.lines && d.lines[0] && d.lines[0].text) || ""}`;

function union(a, b, key) {
  const m = new Map();
  for (const x of [...(a || []), ...(b || [])]) if (x && typeof x === "object") m.set(key(x), x);
  return [...m.values()];
}

export function merge(a, b) {
  a = a || {};
  b = b || {};
  const cleared = Math.max(a.cleared || 0, b.cleared || 0);
  const prefSrc = (a.prefsTs || 0) >= (b.prefsTs || 0) ? a : b;
  const trSrc = (a.trTs || 0) >= (b.trTs || 0) ? a : b;
  const history = union(a.history, b.history, histKey)
    .filter(h => (h.t || 0) > cleared)
    .sort((x, y) => x.t - y.t)
    .slice(-500);
  const mistakes = union(a.mistakes, b.mistakes, mistKey)
    .filter(m => (m.t || 0) > cleared)
    .sort((x, y) => y.t - x.t)
    .slice(0, 300);
  const dialogs = union(a.dialogs, b.dialogs, dlgKey)
    .sort((x, y) => (x.at || 0) - (y.at || 0))
    .slice(-40);
  const rev = {};
  for (const src of [a.rev, b.rev]) {
    for (const [k, r] of Object.entries(src || {})) {
      if (!r || typeof r !== "object" || (r.last || 0) <= cleared) continue;
      if (!rev[k] || (r.last || 0) > (rev[k].last || 0)) rev[k] = r;
    }
  }
  const days = {};
  for (const src of [a.days, b.days]) {
    for (const [k, t] of Object.entries(src || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !(t > cleared)) continue;
      days[k] = Math.max(days[k] || 0, t);
    }
  }
  const words = {};
  for (const src of [a.words, b.words]) {
    for (const [k, w] of Object.entries(src || {})) {
      if (!w || typeof w !== "object" || !(w.a > cleared)) continue;
      if (!words[k] || w.a < words[k].a) words[k] = w;
    }
  }
  return {
    v: SYNC_V,
    prefs: prefSrc.prefs || {},
    prefsTs: prefSrc.prefsTs || 0,
    tr: trSrc.tr || null,
    trTs: trSrc.trTs || 0,
    history,
    mistakes,
    dialogs,
    rev,
    days,
    words,
    cleared,
  };
}

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
