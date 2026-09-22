import { eq } from "drizzle-orm";
import { claims } from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { evaluateRuleSet } from "@/lib/rules";
import { evaluateSettlementCompleteness } from "@/lib/state-machine";

export type SettlementChecklistItem = {
  requirement: string;
  satisfied: boolean;
  label: string;
};

function labelForRequirement(requirement: string): string {
  let doc = requirement;
  try {
    const parsed: unknown = JSON.parse(requirement);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "doc" in parsed &&
      typeof (parsed as { doc: unknown }).doc === "string"
    ) {
      doc = (parsed as { doc: string }).doc;
    }
  } catch {
    doc = requirement;
  }
  return doc.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Settlement readiness checklist for the assessment workbench.
 * Mirrors getFnolChecklist: full requirement list from BR-DOC-001
 * (dry-run, no audit) overlaid with settlement-completeness results.
 */
export async function getSettlementChecklist(
  db: Db,
  claimId: string,
  opts?: { asOf?: string; actor?: string },
): Promise<SettlementChecklistItem[]> {
  const completeness = await evaluateSettlementCompleteness(db, claimId, opts);
  const missingKeys = new Set(
    completeness.missing.map((item) => item.requirement),
  );

  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  if (!claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }

  const ruleResult = await evaluateRuleSet(
    db,
    "BR-DOC-001",
    {
      line_of_business: claim.lineOfBusiness,
      claim_type: claim.claimType,
      estimated_amount: Number(claim.estimatedAmount ?? 0),
    },
    {
      claimId,
      actor: opts?.actor ?? "assessment:checklist",
      asOf: opts?.asOf,
      dryRun: true,
    },
  );

  const requirements = (ruleResult.outputs.settlement_required ??
    []) as unknown[];

  return requirements.map((requirement) => {
    const key =
      typeof requirement === "string"
        ? requirement
        : JSON.stringify(requirement);
    return {
      requirement: key,
      satisfied: !missingKeys.has(key),
      label: labelForRequirement(key),
    };
  });
}
