import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { VerifyExtractionForm } from "@/components/documents/verify-extraction-form";
import { getCurrentUser } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/scope";
import { getDb } from "@/lib/db";
import { claims, tasks } from "@/lib/db/schema";
import { verifyExtractionAction } from "./actions";

type PageProps = {
  params: Promise<{ taskId: string }>;
};

export default async function VerifyExtractionPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !isStaffRole(user.role)) {
    redirect("/login");
  }

  const { taskId } = await params;
  const db = getDb();

  const [taskRow] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!taskRow || taskRow.type !== "verify_extraction") {
    notFound();
  }

  const [claim] = await db
    .select({ claimNumber: claims.claimNumber })
    .from(claims)
    .where(eq(claims.id, taskRow.claimId))
    .limit(1);

  const payload = (taskRow.payloadJson ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Verify extraction</h1>
        <p className="text-sm text-text-muted">
          Claim {claim?.claimNumber ?? taskRow.claimId} · Task {taskId.slice(0, 8)}
        </p>
      </header>

      <VerifyExtractionForm
        taskId={taskRow.id}
        extractionId={String(payload.extractionId ?? "")}
        documentId={String(payload.documentId ?? "")}
        docType={String(payload.docType ?? "document")}
        fields={(payload.fields ?? {}) as Record<string, unknown>}
        confidences={(payload.confidences ?? {}) as Record<string, number>}
        previewUrl={String(payload.previewUrl ?? `/api/documents/${payload.documentId}/preview`)}
        fallback={
          typeof payload.fallback === "string" ? payload.fallback : undefined
        }
        onVerify={verifyExtractionAction}
      />
    </div>
  );
}
