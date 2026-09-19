import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { getVecVersion, loadSqliteVec } from "@/lib/db/vec";

describe("sqlite-vec", () => {
  it("loads and exposes vec_version()", () => {
    const sqlite = new Database(":memory:");
    loadSqliteVec(sqlite);

    expect(getVecVersion(sqlite)).toMatch(/^v?\d+\.\d+/);

    sqlite.close();
  });

  it("supports vec0 KNN queries", () => {
    const sqlite = new Database(":memory:");
    loadSqliteVec(sqlite);

    sqlite.exec(`
      CREATE VIRTUAL TABLE vec_demo USING vec0(
        embedding float[4]
      );
    `);

    const insert = sqlite.prepare(
      "INSERT INTO vec_demo(rowid, embedding) VALUES (?, ?)",
    );
    insert.run(BigInt(1), new Float32Array([0.1, 0.1, 0.1, 0.1]));
    insert.run(BigInt(2), new Float32Array([0.9, 0.9, 0.9, 0.9]));

    const rows = sqlite
      .prepare(
        `SELECT rowid, distance
         FROM vec_demo
         WHERE embedding MATCH ?
         ORDER BY distance
         LIMIT 1`,
      )
      .all(new Float32Array([0.1, 0.1, 0.1, 0.1])) as { rowid: number }[];

    expect(rows[0]?.rowid).toBe(1);
    sqlite.close();
  });
});
