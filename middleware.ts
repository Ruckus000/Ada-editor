import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * The operator portal lives at PORTAL_HOST (portal.adaedit.com). There, the
 * root goes to /portal and nothing of the public site or app is served; on
 * every other production host, /portal doesn't exist. Without PORTAL_HOST
 * (local, CI, previews) /portal works on any host.
 */
const PORTAL_HOST = process.env.PORTAL_HOST?.toLowerCase();

export function middleware(req: NextRequest) {
  if (!PORTAL_HOST) return NextResponse.next();
  const host = req.headers.get('host')?.toLowerCase().split(':')[0];
  const { pathname } = req.nextUrl;
  const portalPath = pathname === '/portal' || pathname.startsWith('/portal/') || pathname.startsWith('/api/portal/');
  if (host === PORTAL_HOST) {
    if (portalPath) return NextResponse.next();
    return NextResponse.redirect(new URL('/portal', `https://${PORTAL_HOST}`));
  }
  if (portalPath && host && !host.endsWith('.vercel.app')) return new NextResponse('Not found', { status: 404 });
  return NextResponse.next();
}

// Pages and the portal API; not static files, images or other APIs.
export const config = { matcher: ['/((?!_next/|api/(?!portal/)|favicon|icon|fonts/).*)'] };
