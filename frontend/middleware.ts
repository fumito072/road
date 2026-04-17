import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const backend = process.env.BACKEND_URL;
  if (!backend) return NextResponse.next();

  const target = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    backend,
  );
  return NextResponse.rewrite(target);
}

export const config = {
  matcher: '/api/:path*',
};
