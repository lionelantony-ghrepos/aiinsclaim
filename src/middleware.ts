import { getIronSession } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getAllowedRolesForPath,
  isPublicPath,
} from "@/lib/auth/route-access";
import { getRoleHomePath } from "@/lib/auth/role-home";
import { sessionOptions } from "@/lib/auth/session-config";
import type { SessionData } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    const response = NextResponse.next();
    const session = await getIronSession<SessionData>(
      request,
      response,
      sessionOptions,
    );

    if (pathname === "/login" && session.user) {
      return NextResponse.redirect(
        new URL(getRoleHomePath(session.user.role), request.url),
      );
    }

    return response;
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions,
  );

  if (!session.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const allowedRoles = getAllowedRolesForPath(pathname);
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    const redirectUrl = new URL(getRoleHomePath(session.user.role), request.url);
    redirectUrl.searchParams.set("notice", "forbidden");
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
