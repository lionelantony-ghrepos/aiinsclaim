import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { FnolWizard } from "@/components/intake/fnol-wizard";
import { canAccessClaim } from "@/lib/auth/scope";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  getDraftClaimDetail,
  listPoliciesForClaimant,
} from "@/lib/db/queries/intake";
import { getFnolChecklist } from "@/lib/intake/checklist";
import {
  createDraftClaimAction,
  getFnolChecklistAction,
  runIntakeCopilotAction,
  submitClaimAction,
  updateDraftClaimAction,
  uploadDocumentAction,
} from "./actions";

type PageProps = {
  searchParams: Promise<{ claimId?: string }>;
};

async function NewClaimWizard({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.role !== "claimant") {
    notFound();
  }

  const db = getDb();
  const policies = await listPoliciesForClaimant(db, user.id);
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
      redirect("/claims");
    }
    initialChecklist = await getFnolChecklist(db, params.claimId, {
      actor: user.id,
    });
  }

  return (
    <FnolWizard
      mode="claimant"
      policies={policies}
      initialDraft={initialDraft}
      initialChecklist={initialChecklist}
      basePath="/claims/new"
      actions={{
        createDraft: createDraftClaimAction,
        updateDraft: updateDraftClaimAction,
        submitClaim: submitClaimAction,
        runCopilot: runIntakeCopilotAction,
        uploadDocument: uploadDocumentAction,
        getChecklist: getFnolChecklistAction,
      }}
    />
  );
}

export default function NewClaimPage(props: PageProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">File a claim</h1>
        <p className="text-text-muted">
          Complete the FNOL wizard step by step. Your progress is saved automatically.
        </p>
      </header>

      <Suspense fallback={<p className="text-sm text-text-muted">Loading wizard…</p>}>
        <NewClaimWizard {...props} />
      </Suspense>
    </div>
  );
}
