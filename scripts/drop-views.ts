/**
 * Drop all views from the database
 * Used before running drizzle-kit push to avoid "Could not process view" errors
 */

import Database from "better-sqlite3";
import { DB_PATH } from "../src/lib/db/paths";

function dropViews() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  
  const views = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='view' ORDER BY name`
    )
    .all() as Array<{ name: string }>;
  
  if (views.length > 0) {
    console.log(`Dropping ${views.length} view(s)...`);
    for (const view of views) {
      sqlite.exec(`DROP VIEW IF EXISTS ${view.name}`);
      console.log(`  - Dropped ${view.name}`);
    }
  }
  
  sqlite.close();
}

if (require.main === module) {
  dropViews();
}

export { dropViews };
