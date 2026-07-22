import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ROLE_PINS, signSession, getSecret, type Role } from '@/server/auth';

const ROLE_VALUES = Object.keys(ROLE_PINS) as [Role, ...Role[]];

const bodySchema = z.object({
  role: z.enum(ROLE_VALUES),
  pin: z.string(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { role, pin } = parsed.data;
  if (pin !== ROLE_PINS[role]) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  }

  const token = await signSession(role, getSecret());
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set('iq_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return res;
}
