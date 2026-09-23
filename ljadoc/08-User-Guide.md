# aiinsclaim — User guide

End-user narrative for the claims workspace. **Update this file only when user-visible UI or commands ship** (delta per PBI). Spec and agent docs stay in `ljadoc/PRD.md`, `ljadoc/DESIGN.md`, and `ljadoc/kb/`.

## Assessment workbench (PBI-015)

Adjusters open a claim from the queue to reach the assessment workbench (`/claims/[id]`), with tabs for Overview, Items, Documents, Financials, Timeline, and Tasks. The Overview shows triage and fraud cards plus a coverage panel (policy limit and deductible math). In Financials, **Suggest reserve** shows an AI proposal that never applies itself — confirm or edit the amounts to set the reserve. Large changes route to a supervisor for approval. Use **Request info** to ask the claimant for documents (the claim pauses until they reply), and **Complete assessment** to move toward settlement once the document checklist is satisfied.

## Settlement and payments (PBI-016)

On a claim in settlement, the Financials tab shows the settlement workbench. **Propose settlement** uses assessed item amounts minus the deductible. **Approve settlement** runs authority rules server-side: within authority the claim moves to approved; above authority a banner notes routing to supervision and a supervisor task appears; an active SIU hold blocks approval with a visible SIU banner. After approval, **Issue payment** records a mock ACH or check payment (reference shown) and moves the claim to paid. **Close claim** succeeds only when the closure checklist passes (no open tasks). **Deny** asks for a coded reason plus a short note, then creates a supervisor confirmation task; only after the supervisor accepts does the claim become denied (claimant is notified along the way).

## Communications drafts (PBI-020)

Staff can open the **Communications** tab on a claim to generate an acknowledgement, information request, or decision-letter draft from the approved template and claim summary. Review and edit the draft, then save it to the mock outbox; generation and saving never send a message. **Send mock communication** records an explicit human-approved mock send. Decision letters retain the claim’s coded denial reason.

## Current release (PBI-003)

The Ledger workbench requires sign-in. Each demo role lands on its own home view and sees only the navigation items permitted for that role.

### Sign in

1. Run the app locally (see Quick start below) or open your deployed URL.
2. Go to **Sign in** (`/login`).
3. Enter a demo email and password `demo1234`, or pick an account from the list on the page.

After sign-in:

- **Claimants** open **My claims**.
- **Intake agents** open **Assisted intake**.
- **Adjusters** and **SIU analysts** open **Work queue**.
- **Supervisors** open **Operations**.
- **Admins** open **Rules**.

Use **Sign out** in the top bar to end your session. Protected pages redirect back to sign-in when you are not authenticated.

### Quick start (developer/demo)

```bash
npm install
npm run db:push
npm run seed
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login).

- Theme toggle is in the top bar (sun/moon).
- Component lab: [http://localhost:3000/dev/components](http://localhost:3000/dev/components) (after sign-in).
- Demo accounts: see [ljadev/README.md](../ljadev/README.md).

---

## Admin — Rules and parameters

**Who:** Admin role only (`/rules`, `/parameters`).

1. **Rules** — Open **Rules** in the sidebar. Each BR-* rule set shows its active version. Open a version to view the decision table (read-only for active/retired).
2. **Create draft** — On an active version, click **Create draft**. Edit rows in the grid (label, conditions, actions JSON), then **Save draft**.
3. **Simulate** — On a draft, click **Simulate**, paste sample inputs as JSON, and **Run simulation**. Results show matched rows and outputs; no audit log is written.
4. **Activate** — On a draft, click **Activate**, enter a change note (min 10 characters) and effective date. The prior active version is retired at that boundary.
5. **Parameters** — Open **Parameters**, edit value (JSON), type, and effective date, then **Save**. Changes affect live rule evaluation (e.g. lowering `stp.max_amount` blocks STP for higher claim amounts).
6. **SLA sweep** — Open **SLA sweep** and click **Run SLA sweep now** to evaluate active timers and apply escalation tiers (same logic as the secured `/api/sweep/sla` endpoint used by production cron).

_Future sections (FNOL wizard, staff queues) will be appended here as later PBIs ship._
