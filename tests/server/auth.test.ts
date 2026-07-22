import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '@/server/auth';

// NOTE: deviation from the brief — signSession/verifySession are async here
// because src/server/auth.ts must run in Edge middleware, where node:crypto
// is unavailable. We use the Web Crypto API (globalThis.crypto.subtle),
// which is only accessible asynchronously.
describe('session', () => {
  it('round-trips a valid token', async () => {
    expect(await verifySession(await signSession('producer', 's3cret'), 's3cret')).toBe('producer');
  });
  it('rejects tampered role or wrong secret', async () => {
    const t = await signSession('contestant', 's3cret');
    expect(await verifySession(t.replace('contestant', 'producer'), 's3cret')).toBeNull();
    expect(await verifySession(t, 'other')).toBeNull();
    expect(await verifySession(undefined, 's3cret')).toBeNull();
  });
});
