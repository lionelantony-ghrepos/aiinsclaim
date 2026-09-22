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
    redacted[key] = redactForAgent(entry);
  }
  return redacted as T;
}
