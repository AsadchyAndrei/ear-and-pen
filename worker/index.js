// Cloudflare Worker: a narrow backend for Ear & Pen.
// It never forwards arbitrary prompts — it only accepts the four known tasks
// and builds the prompt itself from prompts.js, so the API key can't be used as a general proxy.
import { PROMPTS, JSON_TASKS } from "../prompts.js";
import { builtinTexts } from "../content.js";
const BUILTIN_TXT = builtinTexts();
import { verifyIdToken, allowedEmail, useQuota } from "./auth.js";
import { vapidKeys, sendPush, runReminders, reminderText, deviceId } from "./push.js";

const MAX_BODY = 12_000;
const hits = new Map(); // ip -> [timestamps], best-effort per isolate

function cors(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok ? origin || "*" : "null",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
    },
  };
}

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });

// Paid features need a signed-in person whose verified email is on ALLOWED_EMAILS (a secret).
// Returns {uid} or {error, status}.
async function who(request, env) {
  if (!env.ALLOWED_EMAILS) return { error: "access_not_configured", status: 503 };
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "sign_in_required", status: 401 };
  try {
    const claims = await verifyIdToken(token, env.FIREBASE_PROJECT || "ear-and-pen");
    if (!allowedEmail(claims, env.ALLOWED_EMAILS)) return { error: "not_allowed", status: 403 };
    return { uid: claims.sub };
  } catch (e) {
    if (e && e.code) return { error: e.code === "token_expired" ? "token_expired" : e.code, status: 401 };
    console.log("auth", String(e));
    return { error: "auth_unavailable", status: 503 };
  }
}

function rateLimited(ip, perMinute) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > perMinute;
}

/* ---------- Voice: Google Chirp 3 HD, made once per sentence and kept in KV ----------
   GET /tts?t=<text>&v=<voice>&l=<en-US|en-GB>&r=<rate> → audio/mpeg */
const TTS_VOICES = new Set(["Puck", "Charon", "Fenrir", "Orus", "Achird", "Kore", "Aoede", "Leda", "Zephyr", "Sulafat"]);
const TTS_LOCALES = new Set(["en-US", "en-GB"]);
const TTS_RATES = new Set(["0.6", "0.7", "0.85", "1"]);
const ttsHits = new Map();

async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
const audio = (buf, headers, from) => new Response(buf, { status: 200, headers: {
  ...headers, "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=31536000, immutable", "X-Audio": from } });

async function tts(request, url, env, ctx, headers, ip) {
  const t = String(url.searchParams.get("t") || "").replace(/\s+/g, " ").trim();
  const v = url.searchParams.get("v") || "Puck";
  const l = url.searchParams.get("l") || "en-US";
  const r = url.searchParams.get("r") || "1";
  if (!t || t.length > 400 || !/[a-z]/i.test(t) || /[<>{}\\]|https?:/i.test(t)
      || !TTS_VOICES.has(v) || !TTS_LOCALES.has(l) || !TTS_RATES.has(r)) return json({ error: "bad_request" }, 400, headers);
  const name = `${l}-Chirp3-HD-${v}`;
  const key = "tts:" + await sha(`${name}|${r}|${t}`);
  if (env.AUDIO) {
    const hit = await env.AUDIO.get(key, "arrayBuffer");
    if (hit) return audio(hit, headers, "kept");
  }
  if (!env.GOOGLE_TTS_KEY) return json({ error: "tts_not_configured" }, 503, headers);
  // audio already made is free to replay; the built-in material (content.js) is voiced for everyone;
  // any other new audio costs money, so it needs an allowed person
  if (!BUILTIN_TXT.has(t)) {
    const me = await who(request, env);
    if (me.error) return json({ error: me.error }, me.status, headers);
    if (!(await useQuota(env.AUDIO, me.uid, "tts", Number(env.TTS_DAILY_LIMIT || 600)))) return json({ error: "daily_limit" }, 429, headers);
  }
  // new audio costs money: limit per address
  const m = Math.floor(Date.now() / 60000), h = ttsHits.get(ip);
  if (!h || h.m !== m) { if (ttsHits.size > 5000) ttsHits.clear(); ttsHits.set(ip, { m, n: 1 }); }
  else if (++h.n > Number(env.TTS_PER_MINUTE || 60)) return json({ error: "rate_limited" }, 429, headers);

  const res = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": String(env.GOOGLE_TTS_KEY).trim() },
    body: JSON.stringify({ input: { text: t }, voice: { languageCode: l, name }, audioConfig: { audioEncoding: "MP3", speakingRate: Number(r) } }),
  });
  if (!res.ok) {
    let info = {};
    try { info = (await res.json()).error || {}; } catch {}
    console.log("tts error", res.status, info.status, info.message);
    return json({ error: "tts_failed", upstream: { status: res.status, reason: info.status, message: String(info.message || "").slice(0, 200) } }, 502, headers);
  }
  const b64 = (await res.json()).audioContent || "";
  const bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  if (env.AUDIO) ctx.waitUntil(env.AUDIO.put(key, buf).catch(e => console.log("kv put", String(e))));
  return audio(buf, headers, "new");
}

/* ---------- Speech recognition: Google Speech-to-Text, for an allowed person ----------
   POST /stt?l=<en-US|en-GB>  body: 16-bit PCM, 16 kHz, mono (one spoken phrase) → {alts: [...]}
   The same Google key as the voice (it must also allow the Speech-to-Text API). */
const sttHits = new Map();
const STT_MODELS = new Set(["latest_long", "latest_short", "default", "command_and_search", "video", "phone_call"]);
const MAX_STT = 16000 * 2 * 20; // 20 seconds of raw 16 kHz sound (compressed WebM/Ogg is much smaller)
const STT_ENC = { l16: { encoding: "LINEAR16", sampleRateHertz: 16000 }, webm: { encoding: "WEBM_OPUS", sampleRateHertz: 48000 }, ogg: { encoding: "OGG_OPUS", sampleRateHertz: 48000 } };
async function stt(request, url, env, headers, ip) {
  if (!env.GOOGLE_TTS_KEY) return json({ error: "stt_not_configured" }, 503, headers);
  const me = await who(request, env);
  if (me.error) return json({ error: me.error }, me.status, headers);
  const m = Math.floor(Date.now() / 60000), h = sttHits.get(ip);
  if (!h || h.m !== m) { if (sttHits.size > 5000) sttHits.clear(); sttHits.set(ip, { m, n: 1 }); }
  else if (++h.n > Number(env.STT_PER_MINUTE || 30)) return json({ error: "rate_limited" }, 429, headers);
  const l = url.searchParams.get("l") || "en-US";
  if (!TTS_LOCALES.has(l)) return json({ error: "bad_request" }, 400, headers);
  const model = STT_MODELS.has(url.searchParams.get("m")) ? url.searchParams.get("m") : (env.STT_MODEL || "default");
  const enc = STT_ENC[url.searchParams.get("enc") || "l16"];
  if (!enc) return json({ error: "bad_request" }, 400, headers);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length < (enc.encoding === "LINEAR16" ? 3200 : 600) || buf.length > MAX_STT) return json({ error: buf.length < 3200 ? "too_short" : "too_large" }, 400, headers);
  if (!(await useQuota(env.AUDIO, me.uid, "stt", Number(env.STT_DAILY_LIMIT || 400)))) return json({ error: "daily_limit" }, 429, headers);
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const res = await fetch("https://speech.googleapis.com/v1/speech:recognize", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": String(env.GOOGLE_TTS_KEY).trim() },
    body: JSON.stringify({
      config: { ...enc, languageCode: l, maxAlternatives: 5, enableAutomaticPunctuation: true, model, ...(model === "phone_call" || model === "video" ? { useEnhanced: true } : {}) },
      audio: { content: btoa(bin) },
    }),
  });
  if (!res.ok) {
    let info = {};
    try { info = (await res.json()).error || {}; } catch {}
    console.log("stt error", res.status, info.status, info.message);
    return json({ error: "stt_failed", upstream: { status: res.status, reason: info.status, message: String(info.message || "").slice(0, 200) } }, 502, headers);
  }
  const out = await res.json();
  const results = (out.results || []).filter(r => r.alternatives && r.alternatives.length);
  const alts = results.length === 1
    ? results[0].alternatives.map(a => String(a.transcript || "").trim()).filter(Boolean)
    : results.length ? [results.map(r => String(r.alternatives[0].transcript || "").trim()).join(" ")] : [];
  return json({ alts }, 200, { ...headers, "Cache-Control": "no-store" });
}

function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const start = text.search(/[\[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start >= 0 && end > start) { try { return JSON.parse(text.slice(start, end + 1)); } catch {} }
  return undefined;
}

export default {
  // every 15 minutes (see wrangler.toml): daily practice reminders
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env).then(r => console.log("reminders", JSON.stringify(r))).catch(e => console.log("reminders failed", String(e))));
  },
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const { ok, headers } = cors(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    // the site asks once after sign-in whether this person may use Claude, so it can show locks instead of errors
    if (request.method === "GET" && url.pathname === "/me") {
      if (!ok || !origin) return json({ error: "origin_not_allowed" }, 403, headers);
      const me = await who(request, env);
      return json({ allowed: !me.error, reason: me.error || null }, 200, { ...headers, "Cache-Control": "no-store" });
    }
    // ---------- reminders ----------
    if (url.pathname === "/vapid" && request.method === "GET") {
      if (!ok || !origin) return json({ error: "origin_not_allowed" }, 403, headers);
      if (!env.AUDIO) return json({ error: "push_unavailable" }, 503, headers);
      return json({ key: (await vapidKeys(env.AUDIO)).pub }, 200, headers);
    }
    if (url.pathname.startsWith("/push")) {
      if (!ok || !origin) return json({ error: "origin_not_allowed" }, 403, headers);
      if (!env.AUDIO) return json({ error: "push_unavailable" }, 503, headers);
      const me = await who(request, env);
      if (me.error) return json({ error: me.error }, me.status, headers);
      let body = {};
      if (request.method !== "GET") {
        const raw = await request.text();
        if (raw.length > 20000) return json({ error: "too_large" }, 413, headers);
        try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "bad_request" }, 400, headers); }
      }
      const kv = env.AUDIO;
      if (url.pathname === "/push" && request.method === "POST") {
        const sub = body.sub;
        if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ error: "bad_request" }, 400, headers);
        const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time || "") ? body.time : "19:00";
        const tz = typeof body.tz === "string" && body.tz.length < 64 ? body.tz : "UTC";
        await kv.put(`push:${me.uid}:${await deviceId(sub.endpoint)}`, JSON.stringify({ sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, time, tz, at: Date.now() }));
        return json({ ok: true, time, tz }, 200, headers);
      }
      if (url.pathname === "/push" && request.method === "DELETE") {
        if (typeof body.endpoint === "string") await kv.delete(`push:${me.uid}:${await deviceId(body.endpoint)}`);
        return json({ ok: true }, 200, headers);
      }
      if (url.pathname === "/push/status" && request.method === "POST") {
        const dues = (Array.isArray(body.dues) ? body.dues : []).filter(n => Number.isFinite(n)).slice(0, 500);
        const g = body.goal || {};
        const st = { goalDay: typeof body.goalDay === "string" ? body.goalDay.slice(0, 10) : "", dues,
          goal: { d: Math.max(0, Math.min(9, Number(g.d) || 0)), t: Math.max(0, Math.min(50, Number(g.t) || 0)), r: !!g.r },
          streak: Math.max(0, Math.min(10000, Number(body.streak) || 0)), at: Date.now() };
        try { await kv.put("status:" + me.uid, JSON.stringify(st)); } catch (e) { console.log("status put", String(e)); return json({ ok: false, error: "store_busy" }, 200, headers); }
        return json({ ok: true }, 200, headers);
      }
      if (url.pathname === "/push/test" && request.method === "POST") {
        const v = await vapidKeys(kv);
        const st = await kv.get("status:" + me.uid, "json");
        const list = await kv.list({ prefix: `push:${me.uid}:` });
        let sent = 0;
        for (const { name } of list.keys) {
          const rec = await kv.get(name, "json"); if (!rec) continue;
          const msg = { ...reminderText(st), title: "Напоминания включены", tag: "test" };
          const status = await sendPush(rec.sub, msg, v).catch(() => 0);
          if (status === 404 || status === 410) await kv.delete(name);
          else if (status >= 200 && status < 300) sent++;
        }
        return json({ ok: sent > 0, sent }, 200, headers);
      }
      return json({ error: "not_found" }, 404, headers);
    }

    if (request.method === "GET" && url.pathname === "/tts") {
      if (!ok || !origin) return json({ error: "origin_not_allowed" }, 403, headers);
      return tts(request, url, env, ctx, headers, request.headers.get("CF-Connecting-IP") || "?");
    }
    if (request.method === "POST" && url.pathname === "/stt") {
      if (!ok || !origin) return json({ error: "origin_not_allowed" }, 403, headers);
      try { return await stt(request, url, env, headers, request.headers.get("CF-Connecting-IP") || "?"); }
      catch (e) { console.log("stt crashed", String(e && e.stack || e)); return json({ error: "stt_crashed", detail: String(e && e.message || e).slice(0, 300) }, 500, headers); }
    }
    if (request.method === "GET") return json({ ok: true, service: "ear-and-pen", voice: !!env.GOOGLE_TTS_KEY, kept: !!env.AUDIO, access: !!env.ALLOWED_EMAILS }, 200, headers);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);
    if (!ok) return json({ error: "origin_not_allowed" }, 403, headers);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503, headers);

    const me = await who(request, env);
    if (me.error) return json({ error: me.error }, me.status, headers);

    const ip = request.headers.get("CF-Connecting-IP") || "?";
    if (rateLimited(ip, Number(env.RATE_PER_MINUTE || 12))) return json({ error: "rate_limited" }, 429, headers);

    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413, headers);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "bad_request" }, 400, headers); }
    const build = PROMPTS[body?.task];
    if (!build) return json({ error: "unknown_task" }, 400, headers);

    if (!(await useQuota(env.AUDIO, me.uid, "ai", Number(env.AI_DAILY_LIMIT || 150)))) return json({ error: "daily_limit" }, 429, headers);
    const prompt = build(body.params || {});
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": String(env.ANTHROPIC_API_KEY).trim(),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.MODEL || "claude-sonnet-5-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.log("anthropic error", res.status, detail.slice(0, 500));
      let info = {};
      try { info = JSON.parse(detail).error || {}; } catch {}
      const code = res.status === 429 ? "rate_limited"
        : res.status === 401 ? "bad_key"
        : /credit balance/i.test(info.message || "") ? "no_credit"
        : "upstream_error";
      return json({ error: code, upstream: { status: res.status, type: info.type, message: String(info.message || "").slice(0, 200) } },
        res.status === 429 ? 429 : 502, headers);
    }
    const out = await res.json();
    const text = (out.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
    if (!text) return json({ error: "empty_completion" }, 502, headers);

    if (JSON_TASKS.includes(body.task)) {
      const data = parseJSON(text);
      if (data === undefined) return json({ error: "invalid_json" }, 502, headers);
      return json({ data }, 200, headers);
    }
    return json({ text }, 200, headers);
  },
};
