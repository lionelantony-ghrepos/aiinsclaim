import type { SessionOptions } from "iron-session";

export const SESSION_COOKIE_NAME = "aiinsclaim_session";

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ?? "dev-only-change-me-in-production-32chars",
  cookieName: SESSION_COOKIE_NAME,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
};
