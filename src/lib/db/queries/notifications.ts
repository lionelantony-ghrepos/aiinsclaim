import { eq } from "drizzle-orm";
import { isStaffRole } from "@/lib/auth/scope";
import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

export async function listNotificationsForUser(db: Db, user: SessionUser) {
  if (isStaffRole(user.role)) {
    return db.select().from(notifications);
  }

  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id));
}
