import { z } from "zod";
import {
  CLAIM_TYPES,
  DOC_TYPES,
  type ClaimType,
  type DocType,
} from "@/lib/db/schema/enums";
import { Money } from "@/lib/schemas/claims";

/** Per-field value + confidence (API-CONTRACTS §extraction). */
export function fieldSchema<T extends z.ZodType>(valueSchema: T) {
  return z.object({
    value: valueSchema.nullable(),
    confidence: z.number().min(0).max(1),
  });
}

export const EstimateLineSchema = z.object({
  desc: z.string(),
  amount: Money,
});

export const ExtractionInvoiceSchema = z.object({
  vendorName: fieldSchema(z.string()),
  invoiceDate: fieldSchema(z.iso.date()),
  totalAmount: fieldSchema(Money),
  lineItems: fieldSchema(
    z.array(z.object({ desc: z.string(), amount: Money })),
  ),
});

export const ExtractionPoliceReportSchema = z.object({
  reportNumber: fieldSchema(z.string()),
  agency: fieldSchema(z.string()),
  incidentDate: fieldSchema(z.iso.date()),
  narrativeSummary: fieldSchema(z.string().max(1000)),
});

export const ExtractionRepairEstimateSchema = z.object({
  shopName: fieldSchema(z.string()),
  estimateTotal: fieldSchema(Money),
  lines: fieldSchema(z.array(EstimateLineSchema)),
});

export type ExtractionFieldsByDocType = {
  invoice: z.infer<typeof ExtractionInvoiceSchema>;
  police_report: z.infer<typeof ExtractionPoliceReportSchema>;
  repair_estimate: z.infer<typeof ExtractionRepairEstimateSchema>;
};

const DOC_TYPE_SCHEMA_MAP = {
  invoice: ExtractionInvoiceSchema,
  police_report: ExtractionPoliceReportSchema,
  repair_estimate: ExtractionRepairEstimateSchema,
} as const satisfies Partial<Record<DocType, z.ZodType>>;

export type ExtractableDocType = keyof typeof DOC_TYPE_SCHEMA_MAP;

export function isExtractableDocType(docType: DocType): docType is ExtractableDocType {
  return docType in DOC_TYPE_SCHEMA_MAP;
}

export function schemaForDocType(docType: ExtractableDocType) {
  return DOC_TYPE_SCHEMA_MAP[docType];
}

export function schemaIdForDocType(docType: ExtractableDocType): string {
  return `extraction.${docType}.v1`;
}

export const ExtractAgentInputSchema = z.object({
  docType: z.enum(DOC_TYPES),
  claimType: z.enum(CLAIM_TYPES),
  fileRef: z.string().min(1),
  expectedFieldsSchemaId: z.string().min(1),
});

export const ExtractAgentEnvelopeSchema = z.object({
  fields: z.record(z.string(), z.unknown()),
  minConfidence: z.number().min(0).max(1),
  anomalies: z.array(z.string()).default([]),
});

export const ExtractAgentOutputSchema = ExtractAgentEnvelopeSchema;

export const VerifyExtractionSchema = z.object({
  taskId: z.uuid(),
  extractionId: z.uuid(),
  corrections: z.record(z.string(), z.unknown()).optional(),
  decision: z.enum(["accept", "reject"]),
});

export type ExtractAgentInput = z.infer<typeof ExtractAgentInputSchema>;
export type ExtractAgentOutput = z.infer<typeof ExtractAgentOutputSchema>;
export type VerifyExtractionInput = z.infer<typeof VerifyExtractionSchema>;

export function parseExtractionFields(
  docType: ExtractableDocType,
  fields: Record<string, unknown>,
) {
  const schema = schemaForDocType(docType);
  return schema.parse(fields);
}

export function flattenExtractionFields(
  parsed: Record<string, { value: unknown; confidence: number }>,
): {
  values: Record<string, unknown>;
  confidences: Record<string, number>;
} {
  const values: Record<string, unknown> = {};
  const confidences: Record<string, number> = {};
  for (const [key, field] of Object.entries(parsed)) {
    values[key] = field.value;
    confidences[key] = field.confidence;
  }
  return { values, confidences };
}

export function minFieldConfidence(confidences: Record<string, number>): number {
  const scores = Object.values(confidences);
  if (scores.length === 0) {
    return 0;
  }
  return Math.min(...scores);
}

export function mergeCorrections(
  base: Record<string, unknown>,
  corrections: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!corrections) {
    return base;
  }
  return { ...base, ...corrections };
}

export function claimTypeLabel(claimType: ClaimType): string {
  return claimType.replaceAll("_", " ");
}
