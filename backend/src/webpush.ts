// Web Push for Workers using only WebCrypto:
//   - VAPID authentication (RFC 8292): an ES256 JWT signed with the server key
//   - Payload encryption "aes128gcm" (RFC 8188 + RFC 8291)

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string; // base64url, 65-byte uncompressed P-256 point
  auth: string; // base64url, 16 bytes
}

export interface VapidConfig {
  publicKey: string; // base64url uncompressed point
  privateKeyJwk: string; // JSON JWK with d, x, y
  subject: string; // mailto: or https: contact
}

export type PushResult = { ok: true } | { ok: false; status: number; gone: boolean; error: string };

const enc = new TextEncoder();

export function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function bytesToB64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** Single-block HKDF (output <= 32 bytes), as used by RFC 8291. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

/** Only real browser push services may be targeted (prevents the server being used to POST to arbitrary URLs). */
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    return (
      h === "fcm.googleapis.com" ||
      h === "android.googleapis.com" ||
      h === "jmt17.google.com" || // Chromium-based builds without Google API keys
      h === "push.apple.com" ||
      h.endsWith(".push.apple.com") ||
      h.endsWith(".push.services.mozilla.com") ||
      h.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}

/** Encrypt `payload` for one subscription (RFC 8291 aes128gcm). Exported for tests. */
export async function encryptPayload(sub: PushSubscriptionKeys, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(sub.p256dh);
  const authSecret = b64urlToBytes(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("Invalid subscription keys");

  // Ephemeral application-server key pair for this message.
  const asKeys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", asKeys.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // The runtime expects the standard `public` field (workers-types names it `$public`).
  const ecdh = { name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, asKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // Single record: payload followed by the 0x02 "last record" delimiter.
  const plaintext = concat(payload, new Uint8Array([2]));
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/** VAPID Authorization header value for the push service that owns `endpoint`. Exported for tests. */
export async function vapidAuthorization(endpoint: string, vapid: VapidConfig): Promise<string> {
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject })),
  );
  const jwk = JSON.parse(vapid.privateKeyJwk) as JsonWebKey;
  const key = await crypto.subtle.importKey("jwk", { ...jwk, key_ops: ["sign"], ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // WebCrypto returns the raw r||s signature, which is exactly the JWS ES256 format.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${bytesToB64url(sig)}, k=${vapid.publicKey}`;
}

/** Send one push message. `gone` means the subscription is dead and should be deleted. */
export async function sendPush(
  sub: PushSubscriptionKeys,
  message: Record<string, unknown>,
  vapid: VapidConfig,
  opts: { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string } = {},
): Promise<PushResult> {
  if (!isPushEndpoint(sub.endpoint)) return { ok: false, status: 0, gone: true, error: "Not a recognised push service" };
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)));
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(sub.endpoint, vapid),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(opts.ttl ?? 6 * 3600),
    Urgency: opts.urgency ?? "high",
  };
  // Topic must be <= 32 URL-safe chars; a newer message with the same topic replaces an undelivered one.
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  try {
    const res = await fetch(sub.endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
    if (res.ok) return { ok: true };
    const text = (await res.text().catch(() => "")).slice(0, 200);
    return { ok: false, status: res.status, gone: res.status === 404 || res.status === 410, error: `Push ${res.status}${text ? `: ${text}` : ""}` };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: `Push failed: ${(e as Error).message}` };
  }
}
