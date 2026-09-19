import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { UserRole } from "@/lib/db/schema";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  authorityLevel: number;
};

export type SessionData = {
  user?: SessionUser;
};

const sessionOptions = {
  password:
    process.env.SESSION_SECRET ?? "dev-only-change-me-in-production-32chars",
  cookieName: "aiinsclaim_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function getCurrentUser() {
  const session = await getSession();
  return session.user ?? null;
}

export async function requireRole(...roles: UserRole[]) {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role)) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}
