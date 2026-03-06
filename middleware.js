import { NextResponse } from 'next/server';

export function middleware(request) {
  const response = NextResponse.next();

  // Security Headers
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');

  // CORS for API v1 endpoints (public API)
  if (request.nextUrl.pathname.startsWith('/api/v1')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  }

  // Version header
  response.headers.set('X-App-Version', '3.1.0');

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and images
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
