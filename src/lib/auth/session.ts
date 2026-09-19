import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { UserRole } from "@/lib/db/schema";
import { sessionOptions } from "./session-config";

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

export async function establishSession(user: SessionUser) {
  const session = await getSession();
  session.user = user;
  await session.save();
}

export async function destroySession() {
  const session = await getSession();
  session.destroy();
}
