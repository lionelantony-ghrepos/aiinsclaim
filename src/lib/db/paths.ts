import path from "node:path";

const projectRoot = process.cwd();

export const DB_PATH =
  process.env.DATABASE_PATH ??
  path.join(projectRoot, "ljadev", "data", "aiinsclaim.db");

export const STORAGE_ROOT =
  process.env.STORAGE_PATH ??
  path.join(projectRoot, "ljadev", "storage", "claim-documents");
