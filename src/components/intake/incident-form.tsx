"use client";

import { Button } from "@/components/ui/button";
import type { FnolClaimType } from "@/lib/intake/constants";
import type {
  IncidentPartialInput,
  ThirdPartyInput,
  VehicleInput,
} from "@/lib/schemas/claims";
import { cn } from "@/lib/utils";

const inputClassName =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const textareaClassName =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export type IncidentFormProps = {
  claimType: FnolClaimType;
  value: IncidentPartialInput;
  onChange: (value: IncidentPartialInput) => void;
  disabled?: boolean;
};

function toDatetimeLocalValue(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value: string) {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function updateVehicle(
  vehicles: VehicleInput[] | undefined,
  index: number,
  patch: Partial<VehicleInput>,
): VehicleInput[] {
  const next = [...(vehicles ?? [])];
  next[index] = { ...next[index], ...patch } as VehicleInput;
  return next;
}

export function IncidentForm({
  claimType,
  value,
  onChange,
  disabled = false,
}: IncidentFormProps) {
  const location = value.location ?? {};

  function patch(patchValue: Partial<IncidentPartialInput>) {
    onChange({ ...value, ...patchValue });
  }

  function patchLocation(field: string, fieldValue: string) {
    onChange({
      ...value,
      location: {
        ...location,
        [field]: fieldValue,
      },
    });
  }

  function patchThirdParty(field: keyof ThirdPartyInput, fieldValue: string) {
    onChange({
      ...value,
      thirdParty: {
        fullName: value.thirdParty?.fullName ?? "",
        ...value.thirdParty,
        [field]: fieldValue,
      },
    });
  }

  const vehicles = value.vehicles ?? [{ make: "", model: "" }];

  return (
    <div className="space-y-6">
      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="text-sm font-semibold text-text">When &amp; where</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">Incident date &amp; time</span>
            <input
              type="datetime-local"
              required
              value={toDatetimeLocalValue(value.incidentAt)}
              onChange={(event) =>
                patch({ incidentAt: fromDatetimeLocalValue(event.target.value) })
              }
              className={inputClassName}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">Estimated amount (USD)</span>
            <input
              type="text"
              inputMode="decimal"
              required
              value={value.estimatedAmount ?? ""}
              onChange={(event) => patch({ estimatedAmount: event.target.value })}
              placeholder="0.00"
              className={inputClassName}
            />
          </label>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-text">Description</span>
          <textarea
            required
            minLength={20}
            rows={4}
            value={value.description ?? ""}
            onChange={(event) => patch({ description: event.target.value })}
            className={cn(textareaClassName, "min-h-24 resize-y")}
            placeholder="Describe what happened (at least 20 characters)…"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium text-text">Street address</span>
            <input
              type="text"
              required
              value={location.line1 ?? ""}
              onChange={(event) => patchLocation("line1", event.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium text-text">Address line 2</span>
            <input
              type="text"
              value={location.line2 ?? ""}
              onChange={(event) => patchLocation("line2", event.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">City</span>
            <input
              type="text"
              required
              value={location.city ?? ""}
              onChange={(event) => patchLocation("city", event.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">State</span>
            <input
              type="text"
              required
              value={location.state ?? ""}
              onChange={(event) => patchLocation("state", event.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-text">Postal code</span>
            <input
              type="text"
              required
              value={location.postalCode ?? ""}
              onChange={(event) => patchLocation("postalCode", event.target.value)}
              className={inputClassName}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.injuryInvolved ?? false}
              onChange={(event) => patch({ injuryInvolved: event.target.checked })}
            />
            <span>Injury involved</span>
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.liabilityDisputed ?? false}
              onChange={(event) => patch({ liabilityDisputed: event.target.checked })}
            />
            <span>Liability disputed</span>
          </label>
        </div>
      </fieldset>

      {claimType === "collision" ? (
        <fieldset className="space-y-4" disabled={disabled}>
          <legend className="text-sm font-semibold text-text">Vehicles</legend>
          {vehicles.map((vehicle, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-md border border-border bg-surface-raised p-3 sm:grid-cols-2"
            >
              <label className="space-y-1 text-sm">
                <span className="font-medium text-text">Make</span>
                <input
                  type="text"
                  required
                  value={vehicle.make}
                  onChange={(event) =>
                    patch({ vehicles: updateVehicle(vehicles, index, { make: event.target.value }) })
                  }
                  className={inputClassName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-text">Model</span>
                <input
                  type="text"
                  required
                  value={vehicle.model}
                  onChange={(event) =>
                    patch({ vehicles: updateVehicle(vehicles, index, { model: event.target.value }) })
                  }
                  className={inputClassName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-text">Year</span>
                <input
                  type="number"
                  value={vehicle.year ?? ""}
                  onChange={(event) =>
                    patch({
                      vehicles: updateVehicle(vehicles, index, {
                        year: event.target.value ? Number(event.target.value) : undefined,
                      }),
                    })
                  }
                  className={inputClassName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-text">VIN</span>
                <input
                  type="text"
                  value={vehicle.vin ?? ""}
                  onChange={(event) =>
                    patch({ vehicles: updateVehicle(vehicles, index, { vin: event.target.value }) })
                  }
                  className={inputClassName}
                />
              </label>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                vehicles: [...vehicles, { make: "", model: "" }],
              })
            }
          >
            Add vehicle
          </Button>

          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-text">Third party (optional)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-text">Full name</span>
                <input
                  type="text"
                  value={value.thirdParty?.fullName ?? ""}
                  onChange={(event) => patchThirdParty("fullName", event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-text">Phone</span>
                <input
                  type="tel"
                  value={value.thirdParty?.phone ?? ""}
                  onChange={(event) => patchThirdParty("phone", event.target.value)}
                  className={inputClassName}
                />
              </label>
            </div>
          </div>
        </fieldset>
      ) : null}

      {claimType === "theft" || claimType === "burglary" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-text">Police report number</span>
          <input
            type="text"
            required
            value={value.policeReportNumber ?? ""}
            onChange={(event) => patch({ policeReportNumber: event.target.value })}
            className={inputClassName}
          />
        </label>
      ) : null}

      {claimType === "glass" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-text">Damaged panel</span>
          <input
            type="text"
            value={value.damagedPanel ?? ""}
            onChange={(event) => patch({ damagedPanel: event.target.value })}
            className={inputClassName}
          />
        </label>
      ) : null}

      {claimType === "water_damage" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-text">Water source</span>
          <input
            type="text"
            value={value.waterSource ?? ""}
            onChange={(event) => patch({ waterSource: event.target.value })}
            className={inputClassName}
          />
        </label>
      ) : null}

      {claimType === "fire" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-text">Fire service reference</span>
          <input
            type="text"
            required
            value={value.fireServiceRef ?? ""}
            onChange={(event) => patch({ fireServiceRef: event.target.value })}
            className={inputClassName}
          />
        </label>
      ) : null}

      {claimType === "storm" ? (
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.incidentDateInStormWindow ?? false}
            onChange={(event) =>
              patch({ incidentDateInStormWindow: event.target.checked })
            }
          />
          <span>Incident date falls within storm window</span>
        </label>
      ) : null}
    </div>
  );
}
