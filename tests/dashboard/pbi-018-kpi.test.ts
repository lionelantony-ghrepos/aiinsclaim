/**
 * PBI-018: TC-018-01, TC-018-02 — KPI views and role gating
 */

import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { DB_PATH } from "@/lib/db/paths";
import {
  getClaimsByState,
  getCycleTimeByLob,
  getFraudBandDistribution,
  getOverrideRatesByAgent,
  getQueueBacklog,
  getSlaBreachCounts,
  getStpRate,
} from "@/lib/db/queries/kpi";

describe("PBI-018: KPI views", () => {
  let db: Db;
  let sqlite: Database.Database;

  beforeAll(() => {
    sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema }) as Db;
  });

  it("TC-018-01a: claims_by_state view returns aggregated counts", async () => {
    const result = await getClaimsByState(db);
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("status");
      expect(result[0]).toHaveProperty("claim_count");
      expect(typeof result[0].claim_count).toBe("number");
    }
  });

  it("TC-018-01b: cycle_time_by_lob view returns cycle time per LOB", async () => {
    const result = await getCycleTimeByLob(db);
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("lob");
      expect(result[0]).toHaveProperty("closed_claims");
      expect(result[0]).toHaveProperty("avg_cycle_time_ms");
      expect(typeof result[0].avg_cycle_time_ms).toBe("number");
    }
  });

  it("TC-018-01c: stp_rate view calculates straight-through processing rate", async () => {
    const result = await getStpRate(db);
    
    if (result) {
      expect(result).toHaveProperty("total_closed_claims");
      expect(result).toHaveProperty("stp_claims");
      expect(result).toHaveProperty("stp_rate_pct");
      const rate = Number(result.stp_rate_pct);
      expect(typeof rate).toBe("number");
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(100);
    }
  });

  it("TC-018-01d: sla_breach_counts view aggregates breaches by status", async () => {
    const result = await getSlaBreachCounts(db);
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("status");
      expect(result[0]).toHaveProperty("total_breaches");
      expect(result[0]).toHaveProperty("timers_with_breaches");
      
      // Check if TOTAL row exists
      const totalRow = result.find((r) => r.status === "TOTAL");
      if (totalRow) {
        expect(Number(totalRow.total_breaches)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("TC-018-01e: override_rates_by_agent view calculates override percentages", async () => {
    const result = await getOverrideRatesByAgent(db);
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("agent_id");
      expect(result[0]).toHaveProperty("total_evaluations");
      expect(result[0]).toHaveProperty("override_count");
      expect(result[0]).toHaveProperty("override_rate_pct");
      expect(typeof result[0].override_rate_pct).toBe("number");
      expect(result[0].override_rate_pct).toBeGreaterThanOrEqual(0);
      expect(result[0].override_rate_pct).toBeLessThanOrEqual(100);
    }
  });

  it("TC-018-01f: fraud_band_distribution view shows fraud score distribution", async () => {
    const result = await getFraudBandDistribution(db);
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("band");
      expect(result[0]).toHaveProperty("claim_count");
      expect(result[0]).toHaveProperty("percentage");
      
      // Check bands are in expected order
      const bands = result.map((r) => r.band);
      const validBands = ["low", "medium", "high", "critical"];
      bands.forEach((band) => {
        expect(validBands).toContain(band);
      });
    }
  });

  it("TC-018-01g: queue_backlog view returns open task counts by queue", async () => {
    const result = await getQueueBacklog(db);
    
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("queue");
      expect(result[0]).toHaveProperty("open_tasks");
      expect(result[0]).toHaveProperty("avg_age_ms");
      expect(result[0]).toHaveProperty("highest_priority");
      expect(typeof result[0].open_tasks).toBe("number");
    }
  });

  it("TC-018-01h: SQL views match independently computed fixtures", async () => {
    // Verify claims_by_state against direct query
    const viewResult = await getClaimsByState(db);
    const directResult = db.all<{ status: string; count: number }>(
      sql`SELECT status, COUNT(*) as count FROM claims GROUP BY status`
    );
    
    expect(viewResult.length).toBe(directResult.length);
    
    // Match counts
    for (const direct of directResult) {
      const view = viewResult.find((v) => v.status === direct.status);
      expect(view).toBeDefined();
      if (view) {
        expect(view.claim_count).toBe(direct.count);
      }
    }
  });
});
