import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

describe("database", () => {
  it("connects and exposes the users table", () => {
    const db = getDb();
    expect(db.select().from(users)).toBeDefined();
  });
});
