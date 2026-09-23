import { z } from "zod";
import { CLAIM_ITEM_TYPES, CLAIM_PARTY_ROLES, DOC_TYPES, LOB_VALUES } from "@/lib/db/schema/enums";
import { FNOL_CLAIM_TYPES } from "@/lib/intake/constants";

export const Money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a decimal with up to 2 places");

export const LocationSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(50),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(2).max(2).default("US"),
});

export const ClaimTypeEnum = z.enum(FNOL_CLAIM_TYPES);
export const LobEnum = z.enum(LOB_VALUES);
export const ClaimPartyRoleEnum = z.enum(CLAIM_PARTY_ROLES);
export const ClaimItemTypeEnum = z.enum(CLAIM_ITEM_TYPES);
export const DocTypeEnum = z.enum(DOC_TYPES);

export const WizardStepEnum = z.enum([
  "incident",
  "parties",
  "items",
  "documents",
  "review",
]);

export const VehicleSchema = z.object({
  make: z.string().min(1).max(80),
  model: z.string().min(1).max(80),
  year: z.int().min(1900).max(2100).optional(),
  vin: z.string().max(17).optional(),
  licensePlate: z.string().max(20).optional(),
  color: z.string().max(40).optional(),
});

export const ThirdPartySchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().max(30).optional(),
  insuranceCarrier: z.string().max(120).optional(),
  policyNumber: z.string().max(80).optional(),
});

const incidentCommonFields = {
  incidentAt: z.iso.datetime(),
  description: z.string().min(20).max(5000),
  location: LocationSchema,
  injuryInvolved: z.boolean(),
  liabilityDisputed: z.boolean(),
  estimatedAmount: Money,
};

export const CollisionIncidentSchema = z.object({
  claimType: z.literal("collision"),
  ...incidentCommonFields,
  vehicles: z.array(VehicleSchema).min(1),
  thirdParty: ThirdPartySchema.optional(),
});

export const TheftIncidentSchema = z.object({
  claimType: z.literal("theft"),
  ...incidentCommonFields,
  policeReportNumber: z.string().min(1).max(80),
});

export const GlassIncidentSchema = z.object({
  claimType: z.literal("glass"),
  ...incidentCommonFields,
  damagedPanel: z.string().min(1).max(120).optional(),
});

export const WaterDamageIncidentSchema = z.object({
  claimType: z.literal("water_damage"),
  ...incidentCommonFields,
  waterSource: z.string().min(1).max(120).optional(),
});

export const FireIncidentSchema = z.object({
  claimType: z.literal("fire"),
  ...incidentCommonFields,
  fireServiceRef: z.string().min(1).max(80),
});

export const StormIncidentSchema = z.object({
  claimType: z.literal("storm"),
  ...incidentCommonFields,
  incidentDateInStormWindow: z.boolean(),
});

export const BurglaryIncidentSchema = z.object({
  claimType: z.literal("burglary"),
  ...incidentCommonFields,
  policeReportNumber: z.string().min(1).max(80),
});

export const IncidentSchema = z.discriminatedUnion("claimType", [
  CollisionIncidentSchema,
  TheftIncidentSchema,
  GlassIncidentSchema,
  WaterDamageIncidentSchema,
  FireIncidentSchema,
  StormIncidentSchema,
  BurglaryIncidentSchema,
]);

/** Partial incident payload for wizard autosave (all fields optional). */
export const IncidentPartialSchema = z.object({
  claimType: ClaimTypeEnum.optional(),
  incidentAt: z.iso.datetime().optional(),
  description: z.string().min(20).max(5000).optional(),
  location: LocationSchema.partial().optional(),
  injuryInvolved: z.boolean().optional(),
  liabilityDisputed: z.boolean().optional(),
  estimatedAmount: Money.optional(),
  vehicles: z.array(VehicleSchema).optional(),
  thirdParty: ThirdPartySchema.optional(),
  policeReportNumber: z.string().min(1).max(80).optional(),
  damagedPanel: z.string().min(1).max(120).optional(),
  waterSource: z.string().min(1).max(120).optional(),
  fireServiceRef: z.string().min(1).max(80).optional(),
  incidentDateInStormWindow: z.boolean().optional(),
});

export const ClaimPartySchema = z.object({
  id: z.uuid().optional(),
  role: ClaimPartyRoleEnum,
  fullName: z.string().min(1).max(200),
  email: z.email().optional(),
  phone: z.string().max(30).optional(),
  address: LocationSchema.partial().optional(),
});

export const ClaimItemSchema = z.object({
  id: z.uuid().optional(),
  itemType: ClaimItemTypeEnum,
  description: z.string().min(1).max(500),
  vehicle: VehicleSchema.optional(),
  claimedAmount: Money.optional(),
});

export const DEFAULT_ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const FileSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.int().positive(),
});

export const ClaimDocumentUploadSchema = z.object({
  claimId: z.uuid(),
  docType: DocTypeEnum,
  file: FileSchema,
});

export const createDraftClaimSchema = z.object({
  policyId: z.uuid(),
  lob: LobEnum,
  claimType: ClaimTypeEnum,
});

export const updateDraftClaimSchema = z.object({
  claimId: z.uuid(),
  step: WizardStepEnum,
  incident: IncidentPartialSchema.optional(),
  parties: z.array(ClaimPartySchema).optional(),
  items: z.array(ClaimItemSchema).optional(),
});

export const submitClaimSchema = z.object({
  claimId: z.uuid(),
});

export const runIntakeCopilotSchema = z.object({
  claimId: z.uuid(),
  narrative: z.string().min(1).max(5000),
  enteredFields: z.record(z.string(), z.unknown()).default({}),
  checklistState: z
    .array(
      z.object({
        requirement: z.string(),
        satisfied: z.boolean(),
      }),
    )
    .optional(),
});

export type MoneyValue = z.infer<typeof Money>;
export type LocationInput = z.infer<typeof LocationSchema>;
export type FnolClaimTypeInput = z.infer<typeof ClaimTypeEnum>;
export type VehicleInput = z.infer<typeof VehicleSchema>;
export type ThirdPartyInput = z.infer<typeof ThirdPartySchema>;
export type IncidentInput = z.infer<typeof IncidentSchema>;
export type IncidentPartialInput = z.infer<typeof IncidentPartialSchema>;
export type ClaimPartyInput = z.infer<typeof ClaimPartySchema>;
export type ClaimItemInput = z.infer<typeof ClaimItemSchema>;
export type ClaimDocumentUploadInput = z.infer<typeof ClaimDocumentUploadSchema>;
export type CreateDraftClaimInput = z.infer<typeof createDraftClaimSchema>;
export type UpdateDraftClaimInput = z.infer<typeof updateDraftClaimSchema>;
export type SubmitClaimInput = z.infer<typeof submitClaimSchema>;
export type RunIntakeCopilotInput = z.infer<typeof runIntakeCopilotSchema>;
export type WizardStep = z.infer<typeof WizardStepEnum>;
