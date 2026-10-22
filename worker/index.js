// Cloudflare Worker: a narrow backend for Ear & Pen.
// It never forwards arbitrary prompts — it only accepts the four known tasks
// and builds the prompt itself from prompts.js, so the API key can't be used as a general proxy.
import { PROMPTS, JSON_TASKS } from "../prompts.js";
import { verifyIdToken, allowedEmail, useQuota } from "./auth.js";

const MAX_BODY = 12_000;
const hits = new Map(); // ip -> [timestamps], best-effort per isolate

function cors(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok ? origin || "*" : "null",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  // audio already made is free to replay; making new audio costs money, so it needs an allowed person
  const me = await who(request, env);
  if (me.error) return json({ error: me.error }, me.status, headers);
  if (!(await useQuota(env.AUDIO, me.uid, "tts", Number(env.TTS_DAILY_LIMIT || 600)))) return json({ error: "daily_limit" }, 429, headers);
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
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const { ok, headers } = cors(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/tts") {
      if (!ok || !origin) return json({ error: "origin_not_allowed" }, 403, headers);
      return tts(request, url, env, ctx, headers, request.headers.get("CF-Connecting-IP") || "?");
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
