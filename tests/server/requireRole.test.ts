import { describe, it, expect } from 'vitest';
import { requireRole, signSession, getSecret } from '@/server/auth';

function requestWithCookie(cookie: string | undefined): Request {
  const headers = new Headers();
  if (cookie !== undefined) {
    headers.set('cookie', cookie);
  }
  return new Request('http://localhost/api/games', { method: 'POST', headers });
}

describe('requireRole', () => {
  it('returns the role for a valid producer cookie', async () => {
    const token = await signSession('producer', getSecret());
    const req = requestWithCookie(`iq_session=${token}`);
    await expect(requireRole(req, ['producer'])).resolves.toBe('producer');
  });

  it('throws UNAUTHORIZED when the cookie is missing', async () => {
    const req = requestWithCookie(undefined);
    await expect(requireRole(req, ['producer'])).rejects.toThrow('UNAUTHORIZED');
  });

  it('throws UNAUTHORIZED for a tampered token', async () => {
    const token = await signSession('producer', getSecret());
    const tampered = token.replace('producer', 'contestant');
    const req = requestWithCookie(`iq_session=${tampered}`);
    await expect(requireRole(req, ['producer'])).rejects.toThrow('UNAUTHORIZED');
  });

  it('throws UNAUTHORIZED when the role is not in the allowed set', async () => {
    const token = await signSession('contestant', getSecret());
    const req = requestWithCookie(`iq_session=${token}`);
    await expect(requireRole(req, ['producer'])).rejects.toThrow('UNAUTHORIZED');
  });
});
