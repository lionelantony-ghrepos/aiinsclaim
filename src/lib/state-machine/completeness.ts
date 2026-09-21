import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  claimItems,
  claimParties,
  claims,
  documents,
  type ClaimStatus,
  type DocType,
} from "@/lib/db/schema";
import { evaluateRuleSet } from "@/lib/rules";
import type { MissingRequirement } from "./errors";

type DocRequirement = {
  doc: string;
  min?: number;
  when_amount_gt?: number;
};

type Requirement = string | DocRequirement;

function isDocRequirement(value: Requirement): value is DocRequirement {
  return typeof value === "object" && value !== null && "doc" in value;
}

function docTypeForRequirement(docKey: string): DocType | null {
  const map: Record<string, DocType> = {
    photo: "photo",
    photos: "photo",
    police_report: "police_report",
    police_report_document: "police_report",
    repair_estimate: "repair_estimate",
    repair_invoice: "invoice",
    contractor_report: "contractor_report",
    fire_report: "fire_report",
    inventory: "inventory",
    ownership_proof: "ownership_proof",
  };
  return map[docKey] ?? null;
}

async function loadClaimContext(db: Db, claimId: string) {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  if (!claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }

  const [partyRows, itemRows, docRows] = await Promise.all([
    db.select().from(claimParties).where(eq(claimParties.claimId, claimId)),
    db.select().from(claimItems).where(eq(claimItems.claimId, claimId)),
    db.select().from(documents).where(eq(documents.claimId, claimId)),
  ]);

  return { claim, partyRows, itemRows, docRows };
}

function checkFieldRequirement(
  requirement: string,
  claim: Awaited<ReturnType<typeof loadClaimContext>>["claim"],
  partyRows: Awaited<ReturnType<typeof loadClaimContext>>["partyRows"],
  itemRows: Awaited<ReturnType<typeof loadClaimContext>>["itemRows"],
): boolean {
  switch (requirement) {
    case "incident_description":
      return Boolean(claim.incidentDescription?.trim());
    case "driver_details":
      return (
        partyRows.some((row) => row.role === "third_party") ||
        itemRows.some((row) => row.itemType === "vehicle")
      );
    case "police_report_number":
      return Boolean(claim.policeReportNumber?.trim());
    case "fire_service_ref":
      return Boolean(
        claim.incidentLocationJson &&
          typeof claim.incidentLocationJson === "object" &&
          "fireServiceRef" in claim.incidentLocationJson &&
          claim.incidentLocationJson.fireServiceRef,
      );
    default:
      return false;
  }
}

function checkDocRequirement(
  requirement: DocRequirement,
  estimatedAmount: number,
  docRows: Awaited<ReturnType<typeof loadClaimContext>>["docRows"],
): boolean {
  if (
    requirement.when_amount_gt !== undefined &&
    estimatedAmount <= requirement.when_amount_gt
  ) {
    return true;
  }

  const docType = docTypeForRequirement(requirement.doc);
  if (!docType) {
    return false;
  }

  const count = docRows.filter((row) => row.docType === docType).length;
  return count >= (requirement.min ?? 1);
}

export async function evaluateFnolCompleteness(
  db: Db,
  claimId: string,
  opts?: { asOf?: string; actor?: string },
): Promise<{
  complete: boolean;
  missing: MissingRequirement[];
  ruleAuditId?: string;
}> {
  const { claim, partyRows, itemRows, docRows } = await loadClaimContext(
    db,
    claimId,
  );
  const estimatedAmount = Number(claim.estimatedAmount ?? 0);

  const ruleResult = await evaluateRuleSet(
    db,
    "BR-DOC-001",
    {
      line_of_business: claim.lineOfBusiness,
      claim_type: claim.claimType,
      estimated_amount: estimatedAmount,
    },
    {
      claimId,
      actor: opts?.actor ?? "state-machine:fnol",
      asOf: opts?.asOf,
    },
  );

  const requirements = (ruleResult.outputs.fnol_required ?? []) as Requirement[];
  const missing: MissingRequirement[] = [];

  for (const requirement of requirements) {
    if (typeof requirement === "string") {
      const satisfied = checkFieldRequirement(
        requirement,
        claim,
        partyRows,
        itemRows,
      );
      if (!satisfied) {
        missing.push({ requirement, satisfied: false });
      }
      continue;
    }

    if (isDocRequirement(requirement)) {
      const satisfied = checkDocRequirement(
        requirement,
        estimatedAmount,
        docRows,
      );
      if (!satisfied) {
        missing.push({
          requirement: JSON.stringify(requirement),
          satisfied: false,
        });
      }
    }
  }

  return {
    complete: missing.length === 0,
    missing,
    ruleAuditId: ruleResult.auditId,
  };
}

export async function evaluateSettlementCompleteness(
  db: Db,
  claimId: string,
  opts?: { asOf?: string; actor?: string },
): Promise<{
  complete: boolean;
  missing: MissingRequirement[];
  ruleAuditId?: string;
}> {
  const { claim, partyRows, itemRows, docRows } = await loadClaimContext(
    db,
    claimId,
  );
  const estimatedAmount = Number(claim.estimatedAmount ?? 0);

  const ruleResult = await evaluateRuleSet(
    db,
    "BR-DOC-001",
    {
      line_of_business: claim.lineOfBusiness,
      claim_type: claim.claimType,
      estimated_amount: estimatedAmount,
    },
    {
      claimId,
      actor: opts?.actor ?? "state-machine:settlement",
      asOf: opts?.asOf,
    },
  );

  const requirements = (ruleResult.outputs.settlement_required ??
    []) as Requirement[];
  const missing: MissingRequirement[] = [];

  for (const requirement of requirements) {
    if (typeof requirement === "string") {
      const docType = docTypeForRequirement(requirement);
      const satisfied = docType
        ? docRows.some((row) => row.docType === docType)
        : checkFieldRequirement(requirement, claim, partyRows, itemRows);
      if (!satisfied) {
        missing.push({ requirement, satisfied: false });
      }
      continue;
    }

    if (isDocRequirement(requirement)) {
      const satisfied = checkDocRequirement(
        requirement,
        estimatedAmount,
        docRows,
      );
      if (!satisfied) {
        missing.push({
          requirement: JSON.stringify(requirement),
          satisfied: false,
        });
      }
    }
  }

  return {
    complete: missing.length === 0,
    missing,
    ruleAuditId: ruleResult.auditId,
  };
}

export const NON_TERMINAL_STATUSES = [
  "draft",
  "submitted",
  "in_triage",
  "in_assessment",
  "pending_info",
  "in_settlement",
  "approved",
  "paid",
] as const satisfies readonly ClaimStatus[];

export function isNonTerminalStatus(status: ClaimStatus): boolean {
  return (NON_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export async function countOpenTasks(db: Db, claimId: string): Promise<number> {
  const { tasks } = await import("@/lib/db/schema");
  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.claimId, claimId),
        inArray(tasks.status, ["open", "in_progress"]),
      ),
    );
  return rows.length;
}
