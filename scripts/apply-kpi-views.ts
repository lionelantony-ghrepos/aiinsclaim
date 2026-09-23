/**
 * PBI-018: Apply KPI views migration
 * Reads ljadev/drizzle/0001_kpi_views.sql and executes it against the SQLite database
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DB_PATH } from "../src/lib/db/paths";

function applyKpiViews() {
  const viewsSqlPath = path.join(process.cwd(), "ljadev/drizzle/0001_kpi_views.sql");
  const viewsSql = fs.readFileSync(viewsSqlPath, "utf8");
  
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  
  console.log("Applying KPI views migration...");
  
  // Execute the SQL (it contains multiple CREATE VIEW statements)
  sqlite.exec(viewsSql);
  
  console.log("✓ KPI views migration applied successfully");
  
  // Verify views were created
  const views = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='view' ORDER BY name`
    )
    .all() as Array<{ name: string }>;
  
  console.log(`\nCreated views (${views.length}):`);
  for (const view of views) {
    console.log(`  - ${view.name}`);
  }
  
  sqlite.close();
}

if (require.main === module) {
  applyKpiViews();
}

export { applyKpiViews };
