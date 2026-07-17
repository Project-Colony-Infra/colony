import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Gate the page routes: without a session cookie, send the browser to the login
// page. The API route handlers do the real token validation themselves, so they
// are excluded here along with static assets and the login page.
export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get("colony_session")?.value);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};
