import { upsertParameterFormAction } from "@/app/(app)/(admin)/parameters/actions";
import { Button } from "@/components/ui/button";
import {
  PARAMETER_VALUE_TYPES,
  type ParameterValueType,
} from "@/lib/db/schema";

type ParameterRow = {
  key: string;
  valueJson: unknown;
  valueType: ParameterValueType;
  effectiveFrom: string;
  description?: string | null;
};

export function ParameterForm({ parameter }: { parameter: ParameterRow }) {
  return (
    <form
      action={upsertParameterFormAction}
      className="grid gap-3 rounded-md border border-border bg-surface-raised p-3 md:grid-cols-[1fr_auto_auto_auto]"
    >
      <input type="hidden" name="key" value={parameter.key} />

      <div className="space-y-1">
        <p className="font-mono text-sm font-medium text-text">{parameter.key}</p>
        {parameter.description ? (
          <p className="text-xs text-text-muted">{parameter.description}</p>
        ) : null}
      </div>

      <label className="space-y-1 text-xs">
        <span className="font-medium text-text">Value (JSON)</span>
        <input
          type="text"
          name="valueJson"
          defaultValue={JSON.stringify(parameter.valueJson)}
          className="h-9 w-full min-w-32 rounded-md border border-border bg-surface px-3 font-mono text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </label>

      <label className="space-y-1 text-xs">
        <span className="font-medium text-text">Type</span>
        <select
          name="valueType"
          defaultValue={parameter.valueType}
          className="h-9 w-full min-w-28 rounded-md border border-border bg-surface px-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {PARAMETER_VALUE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-xs">
        <span className="font-medium text-text">Effective from</span>
        <input
          type="date"
          name="effectiveFrom"
          required
          defaultValue={parameter.effectiveFrom}
          className="h-9 w-full min-w-36 rounded-md border border-border bg-surface px-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 md:col-span-full">
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  );
}
