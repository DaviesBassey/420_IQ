import { NextRequest, NextResponse } from 'next/server';
import { verifySession, getSecret, type Role } from '@/server/auth';

export const config = {
  matcher: ['/console/:path*', '/editor/:path*', '/host/:path*'],
};

const ALLOWED_ROLES: Record<string, Role[]> = {
  console: ['producer', 'editor'],
  editor: ['producer', 'editor'],
  host: ['host', 'producer'],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const section = pathname.split('/')[1];
  const allowedRoles = ALLOWED_ROLES[section] ?? [];

  const token = req.cookies.get('iq_session')?.value;
  const role = await verifySession(token, getSecret());

  if (!role || !allowedRoles.includes(role)) {
    const claimUrl = new URL('/claim', req.url);
    claimUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(claimUrl);
  }

  return NextResponse.next();
}
