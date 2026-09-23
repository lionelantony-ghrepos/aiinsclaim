import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const databasePath =
  process.env.DATABASE_PATH ??
  path.join(process.cwd(), "ljadev", "data", "aiinsclaim.db");

function synchronizeLegacyNotificationsSchema() {
  if (!fs.existsSync(databasePath)) {
    return;
  }

  const sqlite = new Database(databasePath);
  try {
    const table = sqlite
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notifications'",
      )
      .get();
    if (!table) {
      return;
    }

    const columns = new Set(
      sqlite
        .prepare("PRAGMA table_info(notifications)")
        .all()
        .map((column) => column.name),
    );
    const additions = [
      [
        "delivery_status",
        "ALTER TABLE notifications ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'not_applicable'",
      ],
      [
        "draft_type",
        "ALTER TABLE notifications ADD COLUMN draft_type TEXT",
      ],
      [
        "template_id",
        "ALTER TABLE notifications ADD COLUMN template_id TEXT",
      ],
    ];

    for (const [name, statement] of additions) {
      if (!columns.has(name)) {
        sqlite.exec(statement);
      }
    }
  } finally {
    sqlite.close();
  }
}

synchronizeLegacyNotificationsSchema();
const result = spawnSync("npx", ["drizzle-kit", "push"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  shell: true,
  windowsHide: true,
});

process.exit(result.status ?? 1);
