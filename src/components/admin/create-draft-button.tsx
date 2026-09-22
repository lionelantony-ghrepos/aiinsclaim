import { createDraftVersionFormAction } from "@/app/(app)/(admin)/rules/actions";
import { Button } from "@/components/ui/button";
import type { BrCodeInput } from "@/lib/schemas/rules-admin";

export function CreateDraftButton({
  ruleSetCode,
  fromVersionId,
}: {
  ruleSetCode: BrCodeInput;
  fromVersionId: string;
}) {
  return (
    <form action={createDraftVersionFormAction}>
      <input type="hidden" name="ruleSetCode" value={ruleSetCode} />
      <input type="hidden" name="fromVersionId" value={fromVersionId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        data-testid="create-draft-btn"
      >
        Create draft
      </Button>
    </form>
  );
}
