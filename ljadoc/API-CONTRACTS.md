# API / Interface Contracts — aiinsclaim

All mutations are **Next.js server actions**; route handlers only for the SLA sweep and file streams. Every payload validated with Zod; schemas live in `src/lib/schemas/` and are the single source of truth (imported by forms, actions, agents, and tests). Conventions: actions return `Result<T> = { ok: true, data: T } | { ok: false, error: { code, message, fieldErrors? } }`; never throw across the wire; all IDs are uuid strings; money as string-decimal validated `z.string().regex(/^\d+(\.\d{1,2})?$/)` → numeric.

## §claims — Intake & lifecycle (PBI-009, 007)

```ts
// createDraftClaim
z.object({ policyId: z.uuid(), lob: z.enum(['auto','property']), claimType: ClaimTypeEnum })
// → { claimId, claimNumber }

// updateDraftClaim (autosave, partial per wizard step)
z.object({ claimId: z.uuid(), step: z.enum(['incident','parties','items','documents','review']),
  incident: IncidentSchema.partial().optional(),   // per-claim-type discriminated union
  parties: z.array(ClaimPartySchema).optional(),
  items: z.array(ClaimItemSchema).optional() })

// submitClaim → runs BR-DOC-001 guard + transition draft→submitted
z.object({ claimId: z.uuid() })
// error code 'INCOMPLETE_FNOL' carries missing: {requirement, satisfied}[]

// transitionClaim (staff/internal)
z.object({ claimId: z.uuid(), to: ClaimStatusEnum, reason: z.string().min(3) })
// errors: 'ILLEGAL_TRANSITION', 'GUARD_FAILED' (guard detail payload)

IncidentSchema (discriminated on claimType): common { incidentAt: z.iso.datetime(),
  description: z.string().min(20).max(5000), location: LocationSchema,
  injuryInvolved: z.boolean(), liabilityDisputed: z.boolean(),
  estimatedAmount: Money } + per-type fields (collision: vehicles, thirdParty?;
  theft/burglary: policeReportNumber: z.string(); fire: fireServiceRef; …)
```

## §documents / §extraction (PBI-010)

```ts
// uploadClaimDocument (multipart via action)
z.object({ claimId: z.uuid(), docType: DocTypeEnum, file: FileSchema })
// FileSchema: mime in parameters allowlist, size ≤ parameters['doc.max_bytes']

// Per-doc-type extraction output schemas (agent contract + verify UI):
ExtractionInvoice = z.object({ vendorName: F(z.string()), invoiceDate: F(z.iso.date()),
  totalAmount: F(Money), lineItems: F(z.array(z.object({ desc: z.string(), amount: Money }))) })
ExtractionPoliceReport = z.object({ reportNumber: F(z.string()), agency: F(z.string()),
  incidentDate: F(z.iso.date()), narrativeSummary: F(z.string().max(1000)) })
ExtractionRepairEstimate = z.object({ shopName: F(z.string()), estimateTotal: F(Money),
  lines: F(z.array(EstimateLine)) })
// F<T> = { value: T | null, confidence: z.number().min(0).max(1) }
// envelope: { fields: <schema>, minConfidence, anomalies: z.array(z.string()) }

// verifyExtraction
z.object({ extractionId: z.uuid(), corrections: z.record(z.string(), z.unknown()).optional(),
  decision: z.enum(['accept','reject']) })
```

## §rules / §admin (PBI-006, 008)

```ts
// evaluateRuleSet (internal lib, not an action) — see DESIGN §5.2
evaluateRuleSet(code: BrCode, inputs: InputsFor<code>, asOf?: Date, opts?: { dryRun?: boolean })
  : Promise<{ outputs, matchedRuleIds, versionId, auditId? }>

// createDraftVersion
z.object({ ruleSetCode: BrCodeEnum, fromVersionId: z.uuid() })
// updateDraftRows
z.object({ versionId: z.uuid(), rows: z.array(RuleRowSchema) })  // full replace, ordered
RuleRowSchema = z.object({ label: z.string(), order: z.int(),
  conditions: z.array(z.object({ inputKey: z.string(), operator: OperatorEnum, value: z.json() })),
  actions: z.array(z.object({ actionType: ActionTypeEnum, params: z.json() })) })
// simulateVersion (dryRun — never writes audit)
z.object({ versionId: z.uuid(), sampleInputs: z.json() })
// activateVersion
z.object({ versionId: z.uuid(), changeNote: z.string().min(10), effectiveFrom: z.iso.date() })
// errors: 'VERSION_NOT_DRAFT', 'OVERLAPPING_EFFECTIVE'
// upsertParameter
z.object({ key: z.string().regex(/^[a-z0-9_.]+$/), valueJson: z.json(),
  valueType: z.enum(['number','string','boolean','duration']), effectiveFrom: z.iso.date() })
```

## §tasks (PBI-013)

```ts
// listQueue (TanStack Query fetcher)
z.object({ queue: QueueEnum, filters: z.object({ type: TaskTypeEnum.optional(),
  claimType: ClaimTypeEnum.optional(), breachState: z.enum(['ok','warning','breached']).optional() }),
  cursor: z.string().optional(), limit: z.int().max(100).default(25) })
// → ordered by priority desc, sla_due_at asc

// claimTask / releaseTask
z.object({ taskId: z.uuid() })

// resolveTask — reason mandatory on override/reject (schema-level refine)
z.object({ taskId: z.uuid(), resolution: z.enum(['accepted','overridden','rejected']),
  resolutionReason: z.string().min(10).optional(), resultPayload: z.json().optional() })
  .refine(v => v.resolution === 'accepted' || !!v.resolutionReason, 'REASON_REQUIRED')

// bulkReassign (supervisor)
z.object({ taskIds: z.array(z.uuid()).min(1).max(50), assignTo: z.uuid() })
```

## §financials (PBI-015, 016)

```ts
// confirmReserve
z.object({ claimId: z.uuid(), indemnityAmount: Money, expenseAmount: Money,
  sourceAgentRunId: z.uuid().optional() })
// error 'APPROVAL_REQUIRED' when delta > reserve.change_approval_pct → creates approval task

// proposeSettlement
z.object({ claimId: z.uuid(), items: z.array(z.object({ claimItemId: z.uuid(), amount: Money })),
  deductibleApplied: Money, note: z.string().optional() })
// approveSettlement — server evaluates BR-AUTH-001
z.object({ claimId: z.uuid(), settlementId: z.uuid() })
// results: allowed | { routed: taskId } | { blocked: 'SIU_HOLD' }

// issuePayment (mock)
z.object({ claimId: z.uuid(), settlementId: z.uuid(), method: z.enum(['ach_mock','check_mock']) })
// denyClaim
z.object({ claimId: z.uuid(), reasonCode: DenialReasonEnum, note: z.string().min(10) })
```

## §agents (internal orchestrator contracts — AGENT-OPS.md is normative)

Each agent module exports `run(input: In): Promise<Out>` where In/Out are the Zod schemas in AGENT-OPS; orchestrator wraps with: redaction → gateway call → parse → retry-once → agent_runs logging → fallback task on failure. No agent is directly callable from the client.

## Route handlers

```
POST /api/sweep/sla     header x-sweep-secret (env) — runs SLA sweep; 401 otherwise (PBI-014)
GET  /api/documents/:id/preview   signed-URL redirect, RLS-checked (PBI-010)
```

## Error codes (canonical)

`VALIDATION_FAILED, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, ILLEGAL_TRANSITION, GUARD_FAILED, INCOMPLETE_FNOL, REASON_REQUIRED, APPROVAL_REQUIRED, SIU_HOLD, VERSION_NOT_DRAFT, OVERLAPPING_EFFECTIVE, AGENT_UNAVAILABLE, RATE_LIMITED`
