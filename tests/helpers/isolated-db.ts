import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { openIsolatedDb } from "@/lib/db/isolated";

const TEMPLATE_DIR = path.join(os.tmpdir(), "aiinsclaim-pbi004-template");
const TEMPLATE_FILE = path.join(TEMPLATE_DIR, "aiinsclaim.db");
const TEMPLATE_READY = path.join(TEMPLATE_DIR, "ready");
const TEMPLATE_LOCK = path.join(os.tmpdir(), "aiinsclaim-pbi004-template.lock");

function schemaFingerprint() {
  const schemaDir = path.join(process.cwd(), "src", "lib", "db", "schema");
  return fs
    .readdirSync(schemaDir)
    .map((name) => {
      const stat = fs.statSync(path.join(schemaDir, name));
      return `${name}:${stat.mtimeMs}`;
    })
    .sort()
    .join("|");
}

export function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiinsclaim-pbi004-"));
  const file = path.join(dir, "aiinsclaim.db");
  return { dir, file };
}

export function runDrizzlePush(databasePath: string) {
  const fd = waitForLock(180_000);
  try {
    return runDrizzlePushUnlocked(databasePath);
  } finally {
    fs.closeSync(fd);
    fs.rmSync(TEMPLATE_LOCK, { force: true });
  }
}

function runDrizzlePushUnlocked(databasePath: string) {
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

function waitForLock(timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      return fs.openSync(TEMPLATE_LOCK, "wx");
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  throw new Error("Timed out waiting for drizzle-kit template lock");
}

function checkpointSqlite(filePath: string) {
  const sqlite = new Database(filePath);
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  sqlite.close();
}

export function ensurePushedTemplate() {
  const fd = waitForLock(180_000);
  try {
    const fingerprint = schemaFingerprint();
    if (
      fs.existsSync(TEMPLATE_READY) &&
      fs.existsSync(TEMPLATE_FILE) &&
      fs.readFileSync(TEMPLATE_READY, "utf8") === fingerprint
    ) {
      return TEMPLATE_FILE;
    }
    fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
    if (fs.existsSync(TEMPLATE_FILE)) fs.rmSync(TEMPLATE_FILE, { force: true });
    const result = runDrizzlePushUnlocked(TEMPLATE_FILE);
    if (result.status !== 0) {
      throw new Error(
        `${result.error ?? ""}\n${result.stderr}\n${result.stdout}`,
      );
    }
    checkpointSqlite(TEMPLATE_FILE);
    fs.writeFileSync(TEMPLATE_READY, fingerprint);
    return TEMPLATE_FILE;
  } finally {
    fs.closeSync(fd);
    fs.rmSync(TEMPLATE_LOCK, { force: true });
  }
}

export function createPushedClone() {
  const template = ensurePushedTemplate();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiinsclaim-pbi004-"));
  const file = path.join(dir, "aiinsclaim.db");
  fs.copyFileSync(template, file);
  return { dir, file };
}

export function openPushedDb(databasePath: string) {
  return openIsolatedDb(databasePath);
}

export function removeTempDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}
