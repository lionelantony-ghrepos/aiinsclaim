import type { Db } from "@/lib/db/client";
import { evaluateFnolCompleteness } from "@/lib/state-machine";
import { evaluateRuleSet } from "@/lib/rules";
import { eq } from "drizzle-orm";
import { claims } from "@/lib/db/schema";

type DocRequirement = {
  doc: string;
  min?: number;
  when_amount_gt?: number;
};

type Requirement = string | DocRequirement;

function isDocRequirement(value: Requirement): value is DocRequirement {
  return typeof value === "object" && value !== null && "doc" in value;
}

function requirementKey(requirement: Requirement): string {
  return typeof requirement === "string" ? requirement : JSON.stringify(requirement);
}

export type FnolChecklistItem = {
  requirement: string;
  satisfied: boolean;
  label: string;
};

function labelForRequirement(requirement: string): string {
  return requirement
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function getFnolChecklist(
  db: Db,
  claimId: string,
  opts?: { asOf?: string; actor?: string },
): Promise<FnolChecklistItem[]> {
  const completeness = await evaluateFnolCompleteness(db, claimId, opts);
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
      actor: opts?.actor ?? "intake:checklist",
      asOf: opts?.asOf,
      dryRun: true,
    },
  );

  const requirements = (ruleResult.outputs.fnol_required ?? []) as Requirement[];

  return requirements.map((requirement) => {
    const key = requirementKey(requirement);
    return {
      requirement: key,
      satisfied: !missingKeys.has(key),
      label: labelForRequirement(
        isDocRequirement(requirement) ? requirement.doc : key,
      ),
    };
  });
}
