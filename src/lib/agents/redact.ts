const PII_KEYS = new Set([
  "name",
  "fullName",
  "full_name",
  "displayName",
  "display_name",
  "email",
  "phone",
  "address",
  "addressJson",
  "address_json",
  "line1",
  "line2",
  "postalCode",
  "postal_code",
]);
const FREE_TEXT_KEYS = new Set(["summary", "summaryMd", "claimSummaryMd", "narrative", "bodyMd"]);

function redactFreeText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[REDACTED_PHONE]")
    .replace(
      /\b\d+\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Boulevard|Blvd)\b/gi,
      "[REDACTED_ADDRESS]",
    )
    .replace(
      /\b(?:reported by|caller|insured|claimant|policyholder)\s*:\s*[A-Z][A-Za-z'’-]*(?:\s+[A-Z][A-Za-z'’-]*){0,2}/gi,
      (match) => match.replace(/([:]\s*).+$/, "$1[REDACTED_PERSON]"),
    )
    .replace(
      /\b(?:contact|call|email|reach|notify|ask for|speak with)\s+([A-Z][a-z'’-]*)\b/g,
      (match, name: string) => match.replace(name, "[REDACTED_PERSON]"),
    )
    .replace(
      /\b([A-Z][a-z'’-]{2,})\s+(?=(?:reported|reports|called|calls|said|says|described|provided|submitted|lost|noticed|witnessed)\b)/g,
      "[REDACTED_PERSON] ",
    )
    .replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g, "[REDACTED_PERSON]");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strip PII-bearing keys before persisting agent inputs or sending to the gateway.
 */
export function redactForAgent<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactForAgent(entry)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (PII_KEYS.has(key)) {
      redacted[key] = "[REDACTED]";
      continue;
    }
    redacted[key] =
      FREE_TEXT_KEYS.has(key) && typeof entry === "string"
        ? redactFreeText(entry)
        : redactForAgent(entry);
  }
  return redacted as T;
}
