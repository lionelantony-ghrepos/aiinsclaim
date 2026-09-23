export class SweepUnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED" as const;

  constructor() {
    super("UNAUTHORIZED");
    this.name = "SweepUnauthorizedError";
  }
}

export function assertSweepSecret(
  headerValue: string | null | undefined,
  expectedSecret: string | undefined,
): void {
  if (!expectedSecret || !headerValue || headerValue !== expectedSecret) {
    throw new SweepUnauthorizedError();
  }
}

export function authorizeSweepRequest(request: Request): void {
  const secret = request.headers.get("x-sweep-secret");
  assertSweepSecret(secret, process.env.SWEEP_SECRET);
}
