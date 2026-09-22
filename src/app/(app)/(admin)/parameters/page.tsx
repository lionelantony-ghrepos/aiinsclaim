import { ParameterForm } from "@/components/admin/parameter-form";
import { Card } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { listParameters } from "@/lib/db/queries/rules-read";

export default async function ParametersPage() {
  const db = getDb();
  const parameters = await listParameters(db);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Parameters</h1>
        <p className="text-text-muted">
          Business thresholds and tunables with effective dating.
        </p>
      </header>

      <div data-testid="parameters-list" className="space-y-3">
        {parameters.length === 0 ? (
          <Card>
            <p className="text-sm text-text-muted">No parameters configured.</p>
          </Card>
        ) : (
          parameters.map((parameter) => (
            <ParameterForm key={parameter.id} parameter={parameter} />
          ))
        )}
      </div>
    </div>
  );
}
