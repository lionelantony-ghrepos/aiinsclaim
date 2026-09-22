import type { ClaimStatus } from "@/lib/db/schema";

export type MissingRequirement = {
  requirement: string;
  satisfied: boolean;
};

export class IllegalTransitionError extends Error {
  constructor(
    public readonly fromStatus: ClaimStatus,
    public readonly toStatus: ClaimStatus,
  ) {
    super(`Illegal transition: ${fromStatus} → ${toStatus}`);
    this.name = "IllegalTransitionError";
  }
}

export class GuardFailedError extends Error {
  constructor(
    public readonly guardCode: string,
    message: string,
    public readonly details?: {
      missing?: MissingRequirement[];
      [key: string]: unknown;
    },
  ) {
    super(message);
    this.name = "GuardFailedError";
  }
}
