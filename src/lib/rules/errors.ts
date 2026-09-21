export class RuleValidationError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "RuleValidationError";
  }
}

export class NoActiveVersionError extends Error {
  constructor(
    public readonly code: string,
    public readonly asOf: string,
  ) {
    super(`No active version for ${code} as of ${asOf}`);
    this.name = "NoActiveVersionError";
  }
}
