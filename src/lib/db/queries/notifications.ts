import { eq } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

export async function listNotificationsForUser(db: Db, user: SessionUser) {
  if (user.role === "claimant") {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id));
  }

  return db.select().from(notifications);
}
