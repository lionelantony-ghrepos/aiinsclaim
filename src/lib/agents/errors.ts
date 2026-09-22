export class ExtractSchemaError extends Error {
  constructor(message = "Extraction schema validation failed") {
    super(message);
    this.name = "ExtractSchemaError";
  }
}

export class ExtractAgentUnavailableError extends Error {
  constructor(message = "AGENT_UNAVAILABLE") {
    super(message);
    this.name = "ExtractAgentUnavailableError";
  }
}

export class TriageSchemaError extends Error {
  constructor(message = "Triage schema validation failed") {
    super(message);
    this.name = "TriageSchemaError";
  }
}
