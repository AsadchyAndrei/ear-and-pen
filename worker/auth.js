// Who may use the paid features (Claude and new HD audio).
// The site sends the Firebase sign-in token; here we check it ourselves with Google's public keys
// (no Firebase Admin SDK needed) and then look the email up in ALLOWED_EMAILS (a secret, not in the repo).

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let keys = { at: 0, ttl: 0, byKid: new Map() };

const b64url = s => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64json = s => JSON.parse(new TextDecoder().decode(b64url(s)));

async function keyFor(kid, fetchImpl = fetch) {
  if (Date.now() - keys.at > keys.ttl || !keys.byKid.has(kid)) {
    const r = await fetchImpl(JWKS_URL);
    if (!r.ok) throw new Error("jwks " + r.status);
    const ttl = Number((r.headers.get("cache-control") || "").match(/max-age=(\d+)/)?.[1] || 3600) * 1000;
    const { keys: list = [] } = await r.json();
    const byKid = new Map();
    for (const k of list) {
      byKid.set(k.kid, await crypto.subtle.importKey("jwk", { kty: k.kty, n: k.n, e: k.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
    }
    keys = { at: Date.now(), ttl, byKid };
  }
  return keys.byKid.get(kid);
}

// Returns the token's claims, or throws {code}. Follows Firebase's rules for verifying ID tokens.
export async function verifyIdToken(token, projectId, now = Date.now() / 1000, fetchImpl = fetch) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw { code: "sign_in_required" };
  let head, claims;
  try { head = b64json(parts[0]); claims = b64json(parts[1]); } catch { throw { code: "bad_token" }; }
  if (head.alg !== "RS256" || !head.kid) throw { code: "bad_token" };
  const key = await keyFor(head.kid, fetchImpl);
  if (!key) throw { code: "bad_token" };
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) throw { code: "bad_token" };
  const skew = 60;
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw { code: "bad_token" };
  if (!claims.sub || typeof claims.sub !== "string") throw { code: "bad_token" };
  if (!(claims.exp > now - skew)) throw { code: "token_expired" };
  if (!(claims.iat < now + skew) || !(claims.auth_time < now + skew)) throw { code: "bad_token" };
  return claims;
}

// Allowed = verified email that is on the list. An unverified email (a password account someone made
// with another person's address) never counts.
export function allowedEmail(claims, list) {
  const set = new Set(String(list || "").split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean));
  const email = String(claims.email || "").toLowerCase();
  return !!email && claims.email_verified === true && set.has(email);
}

// Daily count per person in KV (best effort: KV is eventually consistent, good enough for a soft cap).
export async function useQuota(kv, uid, kind, limit) {
  if (!kv || !(limit > 0)) return true;
  const day = new Date().toISOString().slice(0, 10);
  const key = `quota:${day}:${kind}:${uid}`;
  const n = Number(await kv.get(key)) || 0;
  if (n >= limit) return false;
  await kv.put(key, String(n + 1), { expirationTtl: 2 * 86400 });
  return true;
}
