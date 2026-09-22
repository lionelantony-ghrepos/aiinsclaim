import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { claimItems, claims } from "@/lib/db/schema";
import type { DocType } from "@/lib/db/schema/enums";
import type { ExtractableDocType } from "@/lib/schemas/agents/extract";

function readString(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readMoney(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  if (typeof value !== "string") {
    return null;
  }
  return /^\d+(\.\d{1,2})?$/.test(value) ? value : null;
}

export async function applyExtractionFields(
  db: Db,
  params: {
    claimId: string;
    docType: DocType;
    fields: Record<string, unknown>;
  },
) {
  if (!isApplyableDocType(params.docType)) {
    return { appliedFields: [] as string[] };
  }

  const appliedFields: string[] = [];
  const now = new Date();

  switch (params.docType) {
    case "invoice": {
      const totalAmount = readMoney(params.fields, "totalAmount");
      const vendorName = readString(params.fields, "vendorName");
      if (totalAmount) {
        const [existingItem] = await db
          .select()
          .from(claimItems)
          .where(eq(claimItems.claimId, params.claimId))
          .limit(1);

        if (existingItem) {
          await db
            .update(claimItems)
            .set({
              claimedAmount: totalAmount,
              description: vendorName
                ? `Repair invoice — ${vendorName}`
                : existingItem.description,
              updatedAt: now,
            })
            .where(eq(claimItems.id, existingItem.id));
        } else {
          await db.insert(claimItems).values({
            id: crypto.randomUUID(),
            claimId: params.claimId,
            itemType: "vehicle",
            description: vendorName ? `Repair invoice — ${vendorName}` : "Repair invoice",
            claimedAmount: totalAmount,
            createdAt: now,
            updatedAt: now,
          });
        }

        await db
          .update(claims)
          .set({ estimatedAmount: totalAmount, updatedAt: now })
          .where(eq(claims.id, params.claimId));

        appliedFields.push("totalAmount", "claimedAmount", "estimatedAmount");
      }
      break;
    }
    case "police_report": {
      const reportNumber = readString(params.fields, "reportNumber");
      if (reportNumber) {
        await db
          .update(claims)
          .set({
            policeReportNumber: reportNumber,
            policeReportPresent: true,
            updatedAt: now,
          })
          .where(eq(claims.id, params.claimId));
        appliedFields.push("policeReportNumber", "policeReportPresent");
      }
      break;
    }
    case "repair_estimate": {
      const estimateTotal = readMoney(params.fields, "estimateTotal");
      const shopName = readString(params.fields, "shopName");
      if (estimateTotal) {
        const [existingItem] = await db
          .select()
          .from(claimItems)
          .where(eq(claimItems.claimId, params.claimId))
          .limit(1);

        if (existingItem) {
          await db
            .update(claimItems)
            .set({
              claimedAmount: estimateTotal,
              description: shopName
                ? `Repair estimate — ${shopName}`
                : existingItem.description,
              updatedAt: now,
            })
            .where(eq(claimItems.id, existingItem.id));
        } else {
          await db.insert(claimItems).values({
            id: crypto.randomUUID(),
            claimId: params.claimId,
            itemType: "vehicle",
            description: shopName ? `Repair estimate — ${shopName}` : "Repair estimate",
            claimedAmount: estimateTotal,
            createdAt: now,
            updatedAt: now,
          });
        }

        await db
          .update(claims)
          .set({ estimatedAmount: estimateTotal, updatedAt: now })
          .where(eq(claims.id, params.claimId));

        appliedFields.push("estimateTotal", "claimedAmount", "estimatedAmount");
      }
      break;
    }
  }

  return { appliedFields };
}

function isApplyableDocType(docType: DocType): docType is ExtractableDocType {
  return (
    docType === "invoice" ||
    docType === "police_report" ||
    docType === "repair_estimate"
  );
}
