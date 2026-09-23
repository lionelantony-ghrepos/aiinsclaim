"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClaimStatusTimeline } from "@/components/claim-status-timeline";
import { FnolChecklist } from "@/components/intake/fnol-checklist";
import { IncidentForm } from "@/components/intake/incident-form";
import { IntakeCopilotPanel } from "@/components/intake/intake-copilot-panel";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClaimActionResult } from "@/app/(app)/(claimant)/claims/new/actions";
import {
  FNOL_CLAIM_TYPES,
  FNOL_CLAIM_TYPE_LABELS,
  FNOL_CLAIM_TYPE_LOB,
  isFnolClaimType,
  lobForFnolClaimType,
  type FnolClaimType,
} from "@/lib/intake/constants";
import type { FnolChecklistItem } from "@/lib/intake/checklist";
import {
  draftDetailToFormState,
  emptyFormState,
  inferWizardStep,
  type FnolFormState,
  type PolicyOption,
  type WizardUiStep,
  uiStepToUpdateStep,
} from "@/lib/intake/form-state";
import type { DraftDetail } from "@/lib/intake/form-state";
import type { IntakeCompletenessHint } from "@/lib/schemas/agents/intake";
import type {
  ClaimItemInput,
  ClaimPartyInput,
  CreateDraftClaimInput,
  RunIntakeCopilotInput,
  SubmitClaimInput,
  UpdateDraftClaimInput,
} from "@/lib/schemas/claims";
import { CLAIM_ITEM_TYPES, CLAIM_PARTY_ROLES, DOC_TYPES } from "@/lib/db/schema/enums";
import { cn } from "@/lib/utils";
import type { FormEvent } from "react";

const inputClassName =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const WIZARD_STEPS: { id: WizardUiStep; label: string }[] = [
  { id: "policy", label: "Policy & type" },
  { id: "incident", label: "Incident" },
  { id: "parties", label: "Parties & items" },
  { id: "documents", label: "Documents" },
  { id: "review", label: "Review" },
];

type AutosaveStatus = "idle" | "saving" | "saved" | "error";

type StaffPolicyHit = PolicyOption & {
  holderEmail?: string | null;
};

export type FnolWizardActions = {
  createDraft: (
    input: CreateDraftClaimInput,
  ) => Promise<ClaimActionResult<{ claimId: string; claimNumber: string }>>;
  updateDraft: (
    input: UpdateDraftClaimInput,
  ) => Promise<ClaimActionResult<{ claimId: string; updatedAt: string }>>;
  submitClaim: (
    input: SubmitClaimInput,
  ) => Promise<
    ClaimActionResult<{ claimId: string; claimNumber: string; status: string }>
  >;
  runCopilot: (
    input: RunIntakeCopilotInput,
  ) => Promise<
    ClaimActionResult<{
      summaryDraft: string;
      completenessHints: IntakeCompletenessHint[];
      confidence: number;
    }>
  >;
  uploadDocument: (
    formData: FormData,
  ) => Promise<
    ClaimActionResult<{
      id: string;
      mimeType: string;
      sizeBytes: number;
      status: string;
    }>
  >;
  getChecklist: (claimId: string) => Promise<ClaimActionResult<FnolChecklistItem[]>>;
  searchPolicies?: (query: string) => Promise<ClaimActionResult<StaffPolicyHit[]>>;
};

export type FnolWizardProps = {
  mode: "claimant" | "staff";
  policies?: PolicyOption[];
  initialDraft?: DraftDetail | null;
  initialChecklist?: FnolChecklistItem[];
  basePath: string;
  actions: FnolWizardActions;
};

type SubmitSuccess = {
  claimId: string;
  claimNumber: string;
};

function claimTypesForPolicy(policy: PolicyOption | undefined): FnolClaimType[] {
  if (!policy) return [...FNOL_CLAIM_TYPES];
  return FNOL_CLAIM_TYPES.filter(
    (type) => FNOL_CLAIM_TYPE_LOB[type] === policy.lineOfBusiness,
  );
}

function buildUpdatePayload(
  state: FnolFormState,
  step: WizardUiStep,
): UpdateDraftClaimInput | null {
  if (!state.claimId) return null;
  const updateStep = uiStepToUpdateStep(step);
  return {
    claimId: state.claimId,
    step: updateStep,
    incident: {
      ...state.incident,
      claimType: state.claimType || undefined,
    },
    parties: state.parties.length ? state.parties : undefined,
    items: state.items.length ? state.items : undefined,
  };
}

export function FnolWizard({
  mode,
  policies = [],
  initialDraft,
  initialChecklist = [],
  basePath,
  actions,
}: FnolWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const restoredState = useMemo(() => {
    if (initialDraft?.claim.status === "draft") {
      return draftDetailToFormState(initialDraft);
    }
    return emptyFormState();
  }, [initialDraft]);

  const [form, setForm] = useState<FnolFormState>(restoredState);
  const [step, setStep] = useState<WizardUiStep>(() =>
    initialDraft ? inferWizardStep(restoredState) : "policy",
  );
  const [checklist, setChecklist] = useState<FnolChecklistItem[]>(initialChecklist);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [autosaveMessage, setAutosaveMessage] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitMissing, setSubmitMissing] = useState<FnolChecklistItem[]>([]);
  const [submitSuccess, setSubmitSuccess] = useState<SubmitSuccess | null>(null);

  const [policySearch, setPolicySearch] = useState("");
  const [policyResults, setPolicyResults] = useState<StaffPolicyHit[]>([]);
  const [policySearchError, setPolicySearchError] = useState<string | null>(null);
  const policySelectRef = useRef<HTMLSelectElement>(null);
  const claimTypeSelectRef = useRef<HTMLSelectElement>(null);

  const resolvePolicyStepValues = useCallback(
    (state: FnolFormState): FnolFormState => {
      const policyId = state.policyId || policySelectRef.current?.value || "";
      const claimTypeRaw =
        state.claimType || claimTypeSelectRef.current?.value || "";
      const claimType = isFnolClaimType(claimTypeRaw) ? claimTypeRaw : "";
      return { ...state, policyId, claimType };
    },
    [],
  );

  const [narrative, setNarrative] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [copilotHints, setCopilotHints] = useState<IntakeCompletenessHint[]>([]);
  const [copilotLoading, setCopilotLoading] = useState(false);

  const [uploadDocType, setUploadDocType] = useState<string>(DOC_TYPES[0]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const selectedPolicy = useMemo(() => {
    const pool =
      mode === "staff" && policyResults.length
        ? policyResults
        : policies;
    return pool.find((policy) => policy.id === form.policyId);
  }, [form.policyId, mode, policies, policyResults]);

  const availableClaimTypes = useMemo(
    () => claimTypesForPolicy(selectedPolicy),
    [selectedPolicy],
  );

  const refreshChecklist = useCallback(
    async (claimId: string) => {
      const result = await actions.getChecklist(claimId);
      if (result.ok) {
        setChecklist(result.data);
      }
    },
    [actions],
  );

  const syncClaimIdToUrl = useCallback(
    (claimId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("claimId", claimId);
      router.replace(`${basePath}?${params.toString()}`, { scroll: false });
    },
    [basePath, router, searchParams],
  );

  const autosave = useCallback(
    async (nextState: FnolFormState, nextStep: WizardUiStep) => {
      const payload = buildUpdatePayload(nextState, nextStep);
      if (!payload) return true;

      setAutosaveStatus("saving");
      setAutosaveMessage("Saving draft…");
      const result = await actions.updateDraft(payload);
      if (!result.ok) {
        setAutosaveStatus("error");
        setAutosaveMessage(result.error.message);
        return false;
      }
      setAutosaveStatus("saved");
      setAutosaveMessage("Draft saved");
      await refreshChecklist(payload.claimId);
      return true;
    },
    [actions, refreshChecklist],
  );

  async function handlePolicySearch() {
    if (!actions.searchPolicies) return;
    setPolicySearchError(null);
    const result = await actions.searchPolicies(policySearch);
    if (!result.ok) {
      setPolicySearchError(result.error.message);
      setPolicyResults([]);
      return;
    }
    setPolicyResults(result.data);
  }

  async function handleCreateDraft(
    state: FnolFormState = form,
  ): Promise<{ claimId: string; claimNumber: string } | null> {
    state = resolvePolicyStepValues(state);
    if (!state.policyId || !state.claimType) {
      setSubmitError("Select a policy and claim type.");
      return null;
    }
    const lob = lobForFnolClaimType(state.claimType);
    const result = await actions.createDraft({
      policyId: state.policyId,
      lob,
      claimType: state.claimType,
    });
    if (!result.ok) {
      setSubmitError(result.error.message);
      return null;
    }
    const nextState: FnolFormState = {
      ...state,
      claimId: result.data.claimId,
      claimNumber: result.data.claimNumber,
      incident: {
        ...state.incident,
        claimType: state.claimType,
      },
    };
    setForm(nextState);
    syncClaimIdToUrl(result.data.claimId);
    await refreshChecklist(result.data.claimId);
    setSubmitError(null);
    return result.data;
  }

  async function goToStep(target: WizardUiStep) {
    setSubmitError(null);

    let workingState = resolvePolicyStepValues(form);
    if (
      workingState.policyId !== form.policyId ||
      workingState.claimType !== form.claimType
    ) {
      setForm(workingState);
    }
    let claimId = workingState.claimId;

    if (step === "policy" && target !== "policy") {
      if (!claimId) {
        const created = await handleCreateDraft(workingState);
        if (!created) return;
        claimId = created.claimId;
        workingState = {
          ...workingState,
          claimId: created.claimId,
          claimNumber: created.claimNumber,
        };
      }
    }

    if (claimId && target !== "policy") {
      const saved = await autosave({ ...workingState, claimId }, step);
      if (!saved) return;
    }

    setStep(target);
  }

  async function handleSubmit() {
    if (!form.claimId) return;
    setSubmitError(null);
    setSubmitMissing([]);

    const saved = await autosave(form, "review");
    if (!saved) return;

    startTransition(async () => {
      const result = await actions.submitClaim({ claimId: form.claimId! });
      if (!result.ok) {
        if (result.error.code === "INCOMPLETE_FNOL" && result.error.missing) {
          const missingItems: FnolChecklistItem[] = result.error.missing.map((item) => ({
            requirement: item.requirement,
            satisfied: item.satisfied,
            label: item.requirement.replaceAll("_", " "),
          }));
          setSubmitMissing(missingItems);
          setChecklist((prev) =>
            prev.map((entry) => {
              const missing = missingItems.find((m) => m.requirement === entry.requirement);
              return missing ? { ...entry, satisfied: false } : entry;
            }),
          );
        }
        setSubmitError(result.error.message);
        return;
      }
      setSubmitSuccess({
        claimId: result.data.claimId,
        claimNumber: result.data.claimNumber,
      });
      router.replace(basePath, { scroll: false });
    });
  }

  async function handleCopilot() {
    if (!form.claimId) return;
    setCopilotLoading(true);
    const result = await actions.runCopilot({
      claimId: form.claimId,
      narrative,
      enteredFields: {
        policyId: form.policyId,
        claimType: form.claimType,
        ...form.incident,
      },
      checklistState: checklist.map((item) => ({
        requirement: item.requirement,
        satisfied: item.satisfied,
      })),
    });
    setCopilotLoading(false);
    if (!result.ok) {
      setSubmitError(result.error.message);
      return;
    }
    setSummaryDraft(result.data.summaryDraft);
    setCopilotHints(result.data.completenessHints);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.claimId) return;
    const uploadForm = event.currentTarget;
    setUploadError(null);
    const formData = new FormData(uploadForm);
    formData.set("claimId", form.claimId);
    const result = await actions.uploadDocument(formData);
    if (!result.ok) {
      setUploadError(result.error.message);
      return;
    }
    uploadForm.reset();
    await refreshChecklist(form.claimId);
    setForm((prev) => ({
      ...prev,
      documents: [
        ...prev.documents,
        {
          id: result.data.id,
          docType: uploadDocType,
          mimeType: result.data.mimeType,
          sizeBytes: result.data.sizeBytes,
          status: result.data.status,
        },
      ],
    }));
  }

  function updateParty(index: number, patch: Partial<ClaimPartyInput>) {
    setForm((prev) => {
      const parties = [...prev.parties];
      parties[index] = { ...parties[index], ...patch } as ClaimPartyInput;
      return { ...prev, parties };
    });
  }

  function addParty() {
    setForm((prev) => ({
      ...prev,
      parties: [
        ...prev.parties,
        { role: "witness", fullName: "" },
      ],
    }));
  }

  function removeParty(index: number) {
    setForm((prev) => ({
      ...prev,
      parties: prev.parties.filter((_, i) => i !== index),
    }));
  }

  function updateItem(index: number, patch: Partial<ClaimItemInput>) {
    setForm((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], ...patch } as ClaimItemInput;
      return { ...prev, items };
    });
  }

  function addItem() {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { itemType: "other", description: "" },
      ],
    }));
  }

  function removeItem(index: number) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }

  if (submitSuccess) {
    return (
      <div data-testid="fnol-wizard" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Claim submitted</CardTitle>
            <p className="text-sm text-text-muted">
              Your claim <strong>{submitSuccess.claimNumber}</strong> has been submitted.
            </p>
          </CardHeader>
          <ClaimStatusTimeline
            steps={[
              { id: "draft", label: "Draft", status: "draft", state: "complete" },
              {
                id: "submitted",
                label: "Submitted",
                status: "submitted",
                state: "current",
              },
              {
                id: "triage",
                label: "Triage",
                status: "in_triage",
                state: "upcoming",
              },
              {
                id: "assessment",
                label: "Assessment",
                status: "in_assessment",
                state: "upcoming",
              },
            ]}
          />
        </Card>
      </div>
    );
  }

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === step);

  return (
    <div data-testid="fnol-wizard" className="space-y-6">
      <nav aria-label="FNOL wizard steps">
        <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
          {WIZARD_STEPS.map((wizardStep, index) => (
            <li key={wizardStep.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void goToStep(wizardStep.id)}
                disabled={!form.claimId && wizardStep.id !== "policy"}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  step === wizardStep.id
                    ? "border-primary bg-surface-raised font-medium text-text"
                    : "border-border bg-surface text-text-muted hover:bg-surface-raised",
                  !form.claimId && wizardStep.id !== "policy"
                    ? "cursor-not-allowed opacity-50"
                    : "",
                )}
                aria-current={step === wizardStep.id ? "step" : undefined}
              >
                <span className="font-mono text-xs">{index + 1}</span>
                {wizardStep.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div
        data-testid="autosave-status"
        aria-live="polite"
        aria-atomic="true"
        className="text-sm text-text-muted"
      >
        {autosaveStatus === "idle" ? null : autosaveMessage}
      </div>

      {submitError ? (
        <p className="text-sm text-danger" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {step === "policy" ? (
            <Card data-testid="step-policy">
              <CardHeader>
                <CardTitle>Policy &amp; claim type</CardTitle>
                <p className="text-sm text-text-muted">
                  {mode === "staff"
                    ? "Search for a policyholder policy, then choose the claim type."
                    : "Choose the policy and type of loss."}
                </p>
              </CardHeader>

              <div className="space-y-4">
                {mode === "staff" ? (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="search"
                        value={policySearch}
                        onChange={(event) => setPolicySearch(event.target.value)}
                        placeholder="Policy number, name, or email"
                        className={inputClassName}
                      />
                      <Button type="button" variant="outline" onClick={() => void handlePolicySearch()}>
                        Search
                      </Button>
                    </div>
                    {policySearchError ? (
                      <p className="text-sm text-danger" role="alert">
                        {policySearchError}
                      </p>
                    ) : null}
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium text-text">Policy</span>
                      <select
                        key={`staff-policy-${form.claimId ?? "new"}`}
                        ref={policySelectRef}
                        required
                        aria-label="Policy"
                        defaultValue={form.policyId}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            policyId: event.target.value,
                            claimType: "",
                          }))
                        }
                        className={inputClassName}
                      >
                        <option value="">Select a policy…</option>
                        {policyResults.map((policy) => (
                          <option key={policy.id} value={policy.id}>
                            {policy.policyNumber} — {policy.holderName}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-text">Policy</span>
                    <select
                      key={`claimant-policy-${form.claimId ?? "new"}`}
                      ref={policySelectRef}
                      required
                      aria-label="Policy"
                      defaultValue={form.policyId}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          policyId: event.target.value,
                          claimType: "",
                        }))
                      }
                      className={inputClassName}
                    >
                      <option value="">Select a policy…</option>
                      {policies.map((policy) => (
                        <option key={policy.id} value={policy.id}>
                          {policy.policyNumber} — {policy.holderName} ({policy.lineOfBusiness})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-text">Claim type</span>
                  <select
                    key={`claim-type-${form.claimId ?? (form.policyId || "new")}`}
                    ref={claimTypeSelectRef}
                    required
                    aria-label="Claim type"
                    defaultValue={form.claimType}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        claimType: event.target.value as FnolClaimType,
                      }))
                    }
                    className={inputClassName}
                  >
                    <option value="">Select claim type…</option>
                    {availableClaimTypes.map((type) => (
                      <option key={type} value={type}>
                        {FNOL_CLAIM_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>

                {form.claimNumber ? (
                  <p className="text-sm text-text-muted">
                    Draft claim: <Badge>{form.claimNumber}</Badge>
                  </p>
                ) : null}
              </div>
            </Card>
          ) : null}

          {step === "incident" && form.claimType ? (
            <Card data-testid="step-incident">
              <CardHeader>
                <CardTitle>Incident details</CardTitle>
                <p className="text-sm text-text-muted">
                  {FNOL_CLAIM_TYPE_LABELS[form.claimType]} — tell us what happened.
                </p>
              </CardHeader>
              <IncidentForm
                claimType={form.claimType}
                value={form.incident}
                onChange={(incident) => setForm((prev) => ({ ...prev, incident }))}
              />
            </Card>
          ) : null}

          {step === "parties" ? (
            <Card data-testid="step-parties">
              <CardHeader>
                <CardTitle>Parties &amp; damaged items</CardTitle>
                <p className="text-sm text-text-muted">
                  Add witnesses, additional parties, and property or contents items.
                </p>
              </CardHeader>

              <div className="space-y-6">
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-text">Parties</h3>
                  {form.parties.length === 0 ? (
                    <p className="text-sm text-text-muted">No additional parties yet.</p>
                  ) : (
                    form.parties.map((party, index) => (
                      <div
                        key={index}
                        className="grid gap-3 rounded-md border border-border bg-surface-raised p-3 sm:grid-cols-2"
                      >
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-text">Role</span>
                          <select
                            value={party.role}
                            onChange={(event) =>
                              updateParty(index, {
                                role: event.target.value as ClaimPartyInput["role"],
                              })
                            }
                            className={inputClassName}
                          >
                            {CLAIM_PARTY_ROLES.filter((role) => role !== "claimant").map(
                              (role) => (
                                <option key={role} value={role}>
                                  {role.replaceAll("_", " ")}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-text">Full name</span>
                          <input
                            type="text"
                            required
                            value={party.fullName}
                            onChange={(event) =>
                              updateParty(index, { fullName: event.target.value })
                            }
                            className={inputClassName}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-text">Email</span>
                          <input
                            type="email"
                            value={party.email ?? ""}
                            onChange={(event) =>
                              updateParty(index, { email: event.target.value })
                            }
                            className={inputClassName}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-text">Phone</span>
                          <input
                            type="tel"
                            value={party.phone ?? ""}
                            onChange={(event) =>
                              updateParty(index, { phone: event.target.value })
                            }
                            className={inputClassName}
                          />
                        </label>
                        <div className="sm:col-span-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeParty(index)}
                          >
                            Remove party
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={addParty}>
                    Add party
                  </Button>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-text">Items</h3>
                  {form.items.length === 0 ? (
                    <p className="text-sm text-text-muted">No items added yet.</p>
                  ) : (
                    form.items.map((item, index) => (
                      <div
                        key={index}
                        className="grid gap-3 rounded-md border border-border bg-surface-raised p-3 sm:grid-cols-2"
                      >
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-text">Item type</span>
                          <select
                            value={item.itemType}
                            onChange={(event) =>
                              updateItem(index, {
                                itemType: event.target.value as ClaimItemInput["itemType"],
                              })
                            }
                            className={inputClassName}
                          >
                            {CLAIM_ITEM_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium text-text">Claimed amount</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.claimedAmount ?? ""}
                            onChange={(event) =>
                              updateItem(index, { claimedAmount: event.target.value })
                            }
                            className={inputClassName}
                          />
                        </label>
                        <label className="space-y-1 text-sm sm:col-span-2">
                          <span className="font-medium text-text">Description</span>
                          <input
                            type="text"
                            required
                            value={item.description}
                            onChange={(event) =>
                              updateItem(index, { description: event.target.value })
                            }
                            className={inputClassName}
                          />
                        </label>
                        <div className="sm:col-span-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(index)}
                          >
                            Remove item
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    Add item
                  </Button>
                </section>
              </div>
            </Card>
          ) : null}

          {step === "documents" ? (
            <Card data-testid="step-documents">
              <CardHeader>
                <CardTitle>Documents</CardTitle>
                <p className="text-sm text-text-muted">
                  Upload photos, reports, and other supporting documents.
                </p>
              </CardHeader>

              <form onSubmit={(event) => void handleUpload(event)} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-text">Document type</span>
                    <select
                      name="docType"
                      aria-label="Document type"
                      value={uploadDocType}
                      onChange={(event) => setUploadDocType(event.target.value)}
                      className={inputClassName}
                    >
                      {DOC_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-text">File</span>
                    <input
                      type="file"
                      name="file"
                      required
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="block w-full text-sm text-text file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-raised file:px-3 file:py-1.5 file:text-sm"
                    />
                  </label>
                </div>
                {uploadError ? (
                  <p className="text-sm text-danger" role="alert">
                    {uploadError}
                  </p>
                ) : null}
                <Button type="submit" variant="outline" size="sm">
                  Upload document
                </Button>
              </form>

              {form.documents.length > 0 ? (
                <ul className="mt-4 space-y-2 text-sm">
                  {form.documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="rounded-md border border-border px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {doc.docType.replaceAll("_", " ")}
                        </span>
                        <DocumentStatusBadge status={doc.status ?? "uploaded"} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          {step === "review" ? (
            <Card data-testid="step-review">
              <CardHeader>
                <CardTitle>Review &amp; submit</CardTitle>
                <p className="text-sm text-text-muted">
                  Confirm your details before submitting the claim.
                </p>
              </CardHeader>

              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-medium text-text">Claim number</dt>
                  <dd className="text-text-muted">{form.claimNumber ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text">Claim type</dt>
                  <dd className="text-text-muted">
                    {form.claimType ? FNOL_CLAIM_TYPE_LABELS[form.claimType] : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-text">Description</dt>
                  <dd className="text-text-muted">{form.incident.description || "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text">Estimated amount</dt>
                  <dd className="text-text-muted">{form.incident.estimatedAmount || "—"}</dd>
                </div>
              </dl>

              {submitMissing.length > 0 ? (
                <div className="mt-4 rounded-md border border-danger/40 bg-surface-raised p-3">
                  <p className="text-sm font-medium text-danger">Missing requirements</p>
                  <ul className="mt-2 list-inside list-disc text-sm text-text">
                    {submitMissing.map((item) => (
                      <li key={item.requirement}>{item.label}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4">
                <Button
                  type="button"
                  data-testid="submit-claim"
                  onClick={() => void handleSubmit()}
                  disabled={isPending}
                >
                  {isPending ? "Submitting…" : "Submit claim"}
                </Button>
              </div>
            </Card>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={stepIndex <= 0}
              onClick={() => void goToStep(WIZARD_STEPS[stepIndex - 1]!.id)}
            >
              Back
            </Button>
            {step !== "review" ? (
              <Button
                type="button"
                onClick={() => void goToStep(WIZARD_STEPS[stepIndex + 1]!.id)}
              >
                Continue
              </Button>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4">
          <FnolChecklist items={checklist} />
          {form.claimId ? (
            <IntakeCopilotPanel
              narrative={narrative}
              onNarrativeChange={setNarrative}
              summaryDraft={summaryDraft}
              onSummaryDraftChange={setSummaryDraft}
              hints={copilotHints}
              onGetSuggestions={handleCopilot}
              loading={copilotLoading}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
