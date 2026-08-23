export type FailureKind =
  | "test_failure"
  | "assertion_failure"
  | "compiler_error"
  | "typecheck_error"
  | "lint_error"
  | "dependency_error"
  | "infrastructure_error"
  | "timeout"
  | "process_exit"
  | "unknown_error";

export interface NormalizedLine {
  index: number;
  raw: string;
  normalized: string;
  timestamp?: string;
  job?: string;
  step?: string;
  duplicateOf?: number;
}

export interface FailureEvent {
  id: string;
  kind: FailureKind;
  framework?: "jest" | "typescript" | "generic";
  job?: string;
  step?: string;
  testName?: string;
  message: string;
  file?: string;
  sourceLine?: number;
  rawStart: number;
  rawEnd: number;
  score: number;
  evidenceReasons: string[];
  stackFiles?: string[];
  duplicateOf?: string;
  cascadeOf?: string;
}

export interface ChangedFile {
  path: string;
  kind: "source" | "test" | "config" | "dependency" | "unknown";
  changedRanges: Array<[number, number]>;
  hunks?: string[];
}

export interface EvidenceSpan {
  id: string;
  eventId: string;
  rawStart: number;
  rawEnd: number;
  text: string;
  estimatedTokens: number;
}

export interface FailureRecord {
  schemaVersion: "0.1";
  runId: string;
  repository?: string;
  pullRequest?: number;
  headSha?: string;
  baseSha?: string;
  startedAt?: string;
  completedAt?: string;
  attemptNumber?: number;
  conclusion: "failure" | "success";
  classification: FailureKind;
  fingerprint: string;
  confidence: number;
  primaryFailure: FailureEvent;
  cascadingFailures: FailureEvent[];
  alternativeFailures: FailureEvent[];
  changedFiles: ChangedFile[];
  relatedChanges: Array<{ file: string; score: number; reasons: string[] }>;
  evidence: EvidenceSpan[];
  reproduce?: { command: string; confidence: number; verified: boolean };
  compression: {
    rawLines: number;
    rawBytes: number;
    rawEstimatedTokens: number;
    packetEstimatedTokens: number;
    reductionPercent: number;
  };
  limitations: string[];
}

export interface Recommendation {
  id: string;
  type: string;
  title: string;
  explanation: string;
  evidence: Array<{ runId: string; fingerprint?: string; metric: string }>;
  action: string;
  confidence: number;
  estimatedImpact?: {
    value: number;
    unit: "minutes_per_month" | "runs" | "percent";
    methodology: string;
  };
  caveats: string[];
}

export interface InsightReport {
  schemaVersion: "0.1";
  generatedFrom: "synthetic-demo" | "stored-runs";
  totalRuns: number;
  failedRuns: number;
  firstAttemptFailureRate: number;
  uniqueFingerprints: number;
  recurringFingerprints: number;
  potentialFlakes: number;
  categoryCounts: Record<string, number>;
  recommendations: Recommendation[];
}

export interface AnalyzeInput {
  logs: string;
  diff: string;
  runId: string;
  repository?: string;
  pullRequest?: number;
  headSha?: string;
  baseSha?: string;
  attemptNumber?: number;
  tokenBudget: number;
}

export interface AnalyzeResult {
  report: FailureRecord;
  context: string;
  summary: string;
}
