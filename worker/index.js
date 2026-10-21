// Cloudflare Worker: a narrow backend for Ear & Pen.
// It never forwards arbitrary prompts — it only accepts the four known tasks
// and builds the prompt itself from prompts.js, so the API key can't be used as a general proxy.
import { PROMPTS, JSON_TASKS } from "../prompts.js";

const MAX_BODY = 12_000;
const hits = new Map(); // ip -> [timestamps], best-effort per isolate

function cors(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok ? origin || "*" : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    },
  };
}

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });

function rateLimited(ip, perMinute) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > perMinute;
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
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const { ok, headers } = cors(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method === "GET") return json({ ok: true, service: "ear-and-pen" }, 200, headers);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);
    if (!ok) return json({ error: "origin_not_allowed" }, 403, headers);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503, headers);

    const ip = request.headers.get("CF-Connecting-IP") || "?";
    if (rateLimited(ip, Number(env.RATE_PER_MINUTE || 12))) return json({ error: "rate_limited" }, 429, headers);

    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413, headers);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "bad_request" }, 400, headers); }
    const build = PROMPTS[body?.task];
    if (!build) return json({ error: "unknown_task" }, 400, headers);

    const prompt = build(body.params || {});
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
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
      return json({ error: res.status === 429 ? "rate_limited" : "upstream_error" }, res.status === 429 ? 429 : 502, headers);
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
