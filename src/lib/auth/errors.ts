export class RulesWriteForbiddenError extends Error {
  constructor(message = "Only admin can write rules tables") {
    super(message);
    this.name = "RulesWriteForbiddenError";
  }
}

export class AppendOnlyViolationError extends Error {
  constructor(table?: string) {
    super(
      table
        ? `Table ${table} is append-only`
        : "Table is append-only",
    );
    this.name = "AppendOnlyViolationError";
  }
}

export class TaskResolutionReasonRequiredError extends Error {
  constructor(
    message = "resolution_reason is required when resolution is overridden or rejected",
  ) {
    super(message);
    this.name = "TaskResolutionReasonRequiredError";
  }
}
