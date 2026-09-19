import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { UserRole } from "./enums";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").$type<UserRole>().notNull(),
  authorityLevel: integer("authority_level").notNull().default(0),
  specialties: text("specialties", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const parties = sqliteTable("parties", {
  id: text("id").primaryKey(),
  partyType: text("party_type").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  addressJson: text("address_json", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  userId: text("user_id").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const policies = sqliteTable("policies", {
  id: text("id").primaryKey(),
  policyNumber: text("policy_number").notNull().unique(),
  holderPartyId: text("holder_party_id")
    .notNull()
    .references(() => parties.id),
  lineOfBusiness: text("line_of_business").notNull(),
  status: text("status").notNull(),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to").notNull(),
  coverageJson: text("coverage_json", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
