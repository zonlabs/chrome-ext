// ── JWT utility using Web Crypto API (available in CF Workers) ───────────────
// Algorithm: HMAC-SHA256 (HS256)
// No external dependencies.

const ALG = { name: 'HMAC', hash: 'SHA-256' };
const EXP_SECONDS = 60 * 60 * 24 * 30; // 30 days

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let binary = '';
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(base64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    ALG,
    false,
    ['sign', 'verify'],
  );
}

// ── Payload type ─────────────────────────────────────────────────────────────
export interface JWTPayload {
  sub: string;   // userId
  email: string;
  name: string;
  picture: string | null;
  plan: string;
  iat: number;
  exp: number;
}

// ── Sign ─────────────────────────────────────────────────────────────────────
export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: JWTPayload = { ...payload, iat: now, exp: now + EXP_SECONDS };

  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body   = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${header}.${body}`;

  const key = await importKey(secret);
  const sig = await crypto.subtle.sign(ALG, key, new TextEncoder().encode(signingInput));

  return `${signingInput}.${b64url(sig)}`;
}

// ── Verify ───────────────────────────────────────────────────────────────────
// Returns the payload on success, null on invalid/expired.
export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sigStr] = parts;
    const signingInput = `${header}.${body}`;

    const key = await importKey(secret);
    const valid = await crypto.subtle.verify(
      ALG,
      key,
      b64urlDecode(sigStr),
      new TextEncoder().encode(signingInput),
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as JWTPayload;

    // Check expiry
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;

    return claims;
  } catch {
    return null;
  }
}
