export const SCORE_WEIGHTS = {
  explicitAssertion: 10,
  compilerError: 8,
  firstSpecific: 6,
  exactChangedFile: 5,
  stackChangedFile: 4,
  precedesDependent: 3,
  knownFingerprint: 2,
  duplicate: -3,
  afterOrigin: -4,
  genericExit: -5,
  dependencyNoise: -7,
  commandFailedOnly: -8,
} as const;

export const DEFAULT_TOKEN_BUDGET = 2000;
export const SCHEMA_VERSION = "0.1" as const;
