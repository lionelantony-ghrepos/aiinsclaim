import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { FnolWizard } from "@/components/intake/fnol-wizard";
import { canAccessClaim } from "@/lib/auth/scope";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getDraftClaimDetail } from "@/lib/db/queries/intake";
import { getFnolChecklist } from "@/lib/intake/checklist";
import {
  createDraftForPolicyholderAction,
  getFnolChecklistAction,
  runIntakeCopilotAction,
  searchPoliciesAction,
  submitClaimAction,
  updateDraftClaimAction,
  uploadDocumentAction,
} from "./actions";

type PageProps = {
  searchParams: Promise<{ claimId?: string }>;
};

async function AssistedIntakeWizard({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (
    !user ||
    !["intake_agent", "admin", "supervisor"].includes(user.role)
  ) {
    notFound();
  }

  const db = getDb();
  const params = await searchParams;

  let initialDraft = null;
  let initialChecklist: Awaited<ReturnType<typeof getFnolChecklist>> = [];

  if (params.claimId) {
    const allowed = await canAccessClaim(db, user, params.claimId);
    if (!allowed) {
      notFound();
    }
    initialDraft = await getDraftClaimDetail(db, params.claimId);
    if (!initialDraft) {
      notFound();
    }
    if (initialDraft.claim.status !== "draft") {
      redirect("/intake/new");
    }
    initialChecklist = await getFnolChecklist(db, params.claimId, {
      actor: user.id,
    });
  }

  return (
    <FnolWizard
      mode="staff"
      initialDraft={initialDraft}
      initialChecklist={initialChecklist}
      basePath="/intake/new"
      actions={{
        createDraft: createDraftForPolicyholderAction,
        updateDraft: updateDraftClaimAction,
        submitClaim: submitClaimAction,
        runCopilot: runIntakeCopilotAction,
        uploadDocument: uploadDocumentAction,
        getChecklist: getFnolChecklistAction,
        searchPolicies: searchPoliciesAction,
      }}
    />
  );
}

export default function AssistedIntakePage(props: PageProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Assisted intake</h1>
        <p className="text-text-muted">
          File a claim on behalf of a policyholder. Drafts autosave as you progress.
        </p>
      </header>

      <Suspense fallback={<p className="text-sm text-text-muted">Loading wizard…</p>}>
        <AssistedIntakeWizard {...props} />
      </Suspense>
    </div>
  );
}
