import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openIsolatedDb } from "@/lib/db/isolated";

export function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiinsclaim-pbi004-"));
  const file = path.join(dir, "aiinsclaim.db");
  return { dir, file };
}

export function runDrizzlePush(databasePath: string) {
  const result = spawnSync("npx", ["drizzle-kit", "push"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: databasePath },
    encoding: "utf8",
    shell: true,
    windowsHide: true,
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message,
  };
}

export function openPushedDb(databasePath: string) {
  return openIsolatedDb(databasePath);
}

export function removeTempDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}
