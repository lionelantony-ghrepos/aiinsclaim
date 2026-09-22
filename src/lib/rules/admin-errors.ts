export class VersionNotDraftError extends Error {
  readonly code = "VERSION_NOT_DRAFT" as const;

  constructor(public readonly versionId: string) {
    super(`Version ${versionId} is not a draft`);
    this.name = "VersionNotDraftError";
  }
}

export class OverlappingEffectiveError extends Error {
  readonly code = "OVERLAPPING_EFFECTIVE" as const;

  constructor(
    public readonly versionId: string,
    public readonly effectiveFrom: string,
  ) {
    super(
      `Effective date ${effectiveFrom} overlaps an existing version for ${versionId}`,
    );
    this.name = "OverlappingEffectiveError";
  }
}

export class ImmutableVersionError extends Error {
  readonly code = "VERSION_NOT_DRAFT" as const;

  constructor(public readonly versionId: string) {
    super(`Version ${versionId} is immutable (not a draft)`);
    this.name = "ImmutableVersionError";
  }
}
