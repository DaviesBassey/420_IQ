// Device-claim auth: role + PIN, signed session cookie.
//
// This module must be importable from Next.js middleware, which runs on the
// Edge runtime where node:crypto is unavailable. We use the Web Crypto API
// (globalThis.crypto.subtle) instead, which is available in both Node and
// Edge — at the cost of signSession/verifySession being async.

export type Role = 'producer' | 'host' | 'contestant' | 'stage' | 'editor';

const ROLES: Role[] = ['producer', 'host', 'contestant', 'stage', 'editor'];
const DEFAULT_PINS: Record<Role, string> = {
  producer: '4200',
  host: '4201',
  contestant: '4202',
  stage: '4203',
  editor: '4204',
};

export const ROLE_PINS: Record<Role, string> = ROLES.reduce((acc, role) => {
  const envKey = `ROLE_PIN_${role.toUpperCase()}`;
  acc[role] = process.env[envKey] ?? DEFAULT_PINS[role];
  return acc;
}, {} as Record<Role, string>);

const DEV_SECRET = 'dev-insecure-secret-change-me';

export function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.warn('SESSION_SECRET not set; using fixed dev secret. Do not use this in production.');
    return DEV_SECRET;
  }
  return secret;
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signSession(role: Role, secret: string): Promise<string> {
  const sig = await hmacSha256Hex(role, secret);
  return `${role}.${sig}`;
}

export async function verifySession(token: string | undefined, secret: string): Promise<Role | null> {
  if (!token) return null;
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;
  const role = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);
  if (!ROLES.includes(role as Role)) return null;
  const expectedSig = await hmacSha256Hex(role, secret);
  if (!timingSafeEqualHex(sig, expectedSig)) return null;
  return role as Role;
}

// Parses a raw `Cookie` request header into a name -> value map. Route
// handlers here run on the Node runtime and receive a standard Fetch API
// `Request`, which has no built-in cookie jar (unlike NextRequest in
// middleware), so we parse the header by hand.
function parseCookieHeader(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

// Authenticates a producer/editor mutation route: reads the `iq_session`
// cookie off the raw Cookie header, verifies it, and checks the resulting
// role is in the allowed set. Throws Error('UNAUTHORIZED') otherwise, which
// callers map to a 401 response.
export async function requireRole(req: Request, allowed: Role[]): Promise<Role> {
  const cookies = parseCookieHeader(req.headers.get('cookie'));
  const role = await verifySession(cookies['iq_session'], getSecret());
  if (!role || !allowed.includes(role)) {
    throw new Error('UNAUTHORIZED');
  }
  return role;
}
