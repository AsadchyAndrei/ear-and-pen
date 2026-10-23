// Daily practice reminders: standard Web Push (VAPID + aes128gcm), no third-party service.
// The worker makes its own VAPID key pair on first use and keeps it in KV, so there is no key to paste anywhere.
//
// KV layout (binding AUDIO, shared with the voice cache):
//   vapid                 {jwk, pub}             the worker's key pair
//   push:<uid>:<id>       {sub, time, tz, at}    one per device that turned reminders on
//   status:<uid>          {goalDay, dues, goal, streak, at}   what the reminder should say
//   sent:<push key>:<date> "1"                   one reminder per device per day

const te = new TextEncoder();
export const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = s => {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// ---------- VAPID keys ----------
export async function vapidKeys(kv) {
  let v = await kv.get("vapid", "json");
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const pub = b64u(await crypto.subtle.exportKey("raw", kp.publicKey));
    await kv.put("vapid", JSON.stringify({ jwk, pub }));
    v = (await kv.get("vapid", "json")) || { jwk, pub }; // if two requests raced, everyone uses the stored pair
  }
  return v;
}

async function vapidAuth(endpoint, v, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(head + "." + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}

// ---------- message encryption (RFC 8291 + RFC 8188, one record) ----------
export async function encrypt(payload, p256dh, auth, salt = crypto.getRandomValues(new Uint8Array(16)), asKeys = null) {
  const uaPub = unb64u(p256dh), authSecret = unb64u(auth);
  const as = asKeys || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, cat(te.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = cat(te.encode(payload), new Uint8Array([2])); // 0x02: last (and only) record
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

// Send one notification. Returns the push service status (201 = accepted, 404/410 = gone).
export async function sendPush(sub, message, v, fetchImpl = fetch) {
  const body = await encrypt(JSON.stringify(message), sub.keys.p256dh, sub.keys.auth);
  const r = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "43200",
      Urgency: "normal",
      Authorization: await vapidAuth(sub.endpoint, v, "https://earandpen.net"),
    },
    body,
  });
  return r.status;
}

// ---------- what to say ----------
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
export function reminderText(st, now = Date.now()) {
  const dues = (st && Array.isArray(st.dues) ? st.dues : []).filter(t => t <= now).length;
  const g = (st && st.goal) || { d: 1, t: 5, r: true };
  const parts = [];
  if (g.d) parts.push(`${g.d} ${plural(g.d, "диалог", "диалога", "диалогов")}`);
  if (g.t) parts.push(`${g.t} ${plural(g.t, "перевод", "перевода", "переводов")}`);
  const goal = parts.length ? `Цель на сегодня: ${parts.join(" и ")}.` : "";
  const streak = st && st.streak > 0 ? ` Серия ${st.streak} ${plural(st.streak, "день", "дня", "дней")} — не прерывайте!` : "";
  if (dues) return { title: `Пора повторить: ${dues} ${plural(dues, "карточка", "карточки", "карточек")}`, body: (goal + streak).trim() || "Пара минут — и ошибки запомнятся.", url: "/#rev", tag: "daily" };
  return { title: "Пора позаниматься английским", body: (goal + streak).trim() || "Один диалог — пять минут.", url: "/#dict", tag: "daily" };
}

// local date and minutes in the person's time zone
export function localNow(tz, now = new Date()) {
  let parts;
  try { parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now); }
  catch { parts = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now); }
  const get = t => parts.find(p => p.type === t)?.value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, min: Number(get("hour")) * 60 + Number(get("minute")) };
}

// every 15 minutes: remind whoever's chosen time has just come, unless today's goal is already done
export async function runReminders(env, now = new Date(), fetchImpl = fetch) {
  const kv = env.AUDIO; if (!kv) return { sent: 0 };
  const v = await vapidKeys(kv);
  let cursor, sent = 0, gone = 0;
  do {
    const page = await kv.list({ prefix: "push:", cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const { name } of page.keys) {
      const rec = await kv.get(name, "json"); if (!rec || !rec.sub) continue;
      const uid = name.split(":")[1];
      const { day, min } = localNow(rec.tz, now);
      const [h, m] = String(rec.time || "19:00").split(":").map(Number);
      const at = h * 60 + m;
      if (!(min >= at && min < at + 15)) continue;
      const st = await kv.get("status:" + uid, "json");
      if (st && st.goalDay === day) continue;
      if (await kv.get(`sent:${name}:${day}`)) continue;
      const status = await sendPush(rec.sub, reminderText(st, now.getTime()), v, fetchImpl).catch(() => 0);
      if (status === 404 || status === 410) { await kv.delete(name); gone++; continue; }
      if (status >= 200 && status < 300) { sent++; await kv.put(`sent:${name}:${day}`, "1", { expirationTtl: 2 * 86400 }); }
    }
  } while (cursor);
  return { sent, gone };
}

export const deviceId = async endpoint => {
  const d = await crypto.subtle.digest("SHA-256", te.encode(endpoint));
  return b64u(d).slice(0, 16);
};
