import type { FnolClaimType } from "@/lib/intake/constants";
import type { ClaimItemType, ClaimPartyRole } from "@/lib/db/schema/enums";
import type {
  ClaimItemInput,
  ClaimPartyInput,
  IncidentPartialInput,
  LocationInput,
  VehicleInput,
} from "@/lib/schemas/claims";

export type DraftDetail = Awaited<
  ReturnType<typeof import("@/lib/db/queries/intake").getDraftClaimDetail>
>;

export type PolicyOption = {
  id: string;
  policyNumber: string;
  lineOfBusiness: string;
  status: string;
  holderName: string;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
};

export type WizardDocument = {
  id: string;
  docType: string;
  fileName?: string;
  mimeType: string;
  sizeBytes: number;
  status?: string;
};

export type FnolFormState = {
  policyId: string;
  claimType: FnolClaimType | "";
  claimId: string | null;
  claimNumber: string | null;
  incident: IncidentPartialInput;
  parties: ClaimPartyInput[];
  items: ClaimItemInput[];
  documents: WizardDocument[];
};

function readLocation(
  json: Record<string, unknown> | null | undefined,
): Partial<LocationInput> | undefined {
  if (!json || typeof json !== "object") {
    return undefined;
  }
  const loc: Partial<LocationInput> = {};
  if (typeof json.line1 === "string") loc.line1 = json.line1;
  if (typeof json.line2 === "string") loc.line2 = json.line2;
  if (typeof json.city === "string") loc.city = json.city;
  if (typeof json.state === "string") loc.state = json.state;
  if (typeof json.postalCode === "string") loc.postalCode = json.postalCode;
  if (typeof json.country === "string") loc.country = json.country;
  return Object.keys(loc).length > 0 ? loc : undefined;
}

function readString(json: Record<string, unknown> | null | undefined, key: string) {
  const value = json?.[key];
  return typeof value === "string" ? value : undefined;
}

function readBoolean(json: Record<string, unknown> | null | undefined, key: string) {
  const value = json?.[key];
  return typeof value === "boolean" ? value : undefined;
}

export function draftDetailToFormState(detail: NonNullable<DraftDetail>): FnolFormState {
  const { claim, parties, items, documents } = detail;
  const locationJson = claim.incidentLocationJson as Record<string, unknown> | null;

  const incident: IncidentPartialInput = {
    claimType: claim.claimType as FnolClaimType,
    incidentAt: claim.incidentAt.toISOString(),
    description: claim.incidentDescription ?? "",
    location: readLocation(locationJson),
    injuryInvolved: claim.injuryInvolved,
    liabilityDisputed: claim.liabilityDisputed,
    estimatedAmount: claim.estimatedAmount ?? "",
    policeReportNumber: claim.policeReportNumber ?? undefined,
    fireServiceRef:
      readString(locationJson, "fireServiceRef") ??
      readString(locationJson, "fireServiceReference"),
    incidentDateInStormWindow:
      readBoolean(locationJson, "incidentDateInStormWindow") ??
      readBoolean(locationJson, "stormWindowVerified"),
    damagedPanel: readString(locationJson, "damagedPanel"),
    waterSource: readString(locationJson, "waterSource"),
    vehicles: items
      .filter((item) => item.itemType === "vehicle" && item.vehicleJson)
      .map((item) => item.vehicleJson as VehicleInput),
    thirdParty: (() => {
      const tp = parties.find((party) => party.role === "third_party");
      if (!tp) return undefined;
      return {
        fullName: tp.fullName,
        phone: tp.phone ?? undefined,
      };
    })(),
  };

  const partyRows: ClaimPartyInput[] = parties
    .filter((party) => party.role !== "third_party")
    .map((party) => ({
      id: party.partyId,
      role: party.role as ClaimPartyRole,
      fullName: party.fullName,
      email: party.email ?? undefined,
      phone: party.phone ?? undefined,
      address: (party.addressJson as Partial<LocationInput> | null) ?? undefined,
    }));

  const itemRows: ClaimItemInput[] = items
    .filter((item) => item.itemType !== "vehicle")
    .map((item) => ({
      id: item.id,
      itemType: item.itemType as ClaimItemType,
      description: item.description,
      vehicle: (item.vehicleJson as VehicleInput | null) ?? undefined,
      claimedAmount: item.claimedAmount ?? undefined,
    }));

  return {
    policyId: claim.policyId,
    claimType: claim.claimType as FnolClaimType,
    claimId: claim.id,
    claimNumber: claim.claimNumber,
    incident,
    parties: partyRows,
    items: itemRows,
    documents: documents.map((doc) => ({
      id: doc.id,
      docType: doc.docType,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      status: doc.status,
    })),
  };
}

export function emptyFormState(): FnolFormState {
  return {
    policyId: "",
    claimType: "",
    claimId: null,
    claimNumber: null,
    incident: {
      injuryInvolved: false,
      liabilityDisputed: false,
    },
    parties: [],
    items: [],
    documents: [],
  };
}

export type WizardUiStep = "policy" | "incident" | "parties" | "documents" | "review";

export function inferWizardStep(state: FnolFormState): WizardUiStep {
  if (!state.claimId) {
    return "policy";
  }
  if (!state.incident.description?.trim()) {
    return "incident";
  }
  if (state.claimType === "collision" && !state.incident.vehicles?.length) {
    return "parties";
  }
  if (state.parties.length === 0 && state.items.length === 0) {
    return "parties";
  }
  return "documents";
}

export function uiStepToUpdateStep(
  step: WizardUiStep,
): "incident" | "parties" | "items" | "documents" | "review" {
  if (step === "policy") return "incident";
  if (step === "parties") return "parties";
  return step;
}
