import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { SessionUser } from "./session";

export async function authenticateUser(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      authorityLevel: users.authorityLevel,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!row || !row.isActive) {
    return null;
  }

  const valid = await bcrypt.compare(password, row.passwordHash);
  if (!valid) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    authorityLevel: row.authorityLevel,
  };
}
