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
