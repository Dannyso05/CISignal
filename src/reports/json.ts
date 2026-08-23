import type { FailureRecord } from "../types.js";

export function validateFailureRecord(value: unknown): value is FailureRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<FailureRecord>;
  return record.schemaVersion === "0.1"
    && typeof record.runId === "string"
    && (record.conclusion === "failure" || record.conclusion === "success")
    && typeof record.fingerprint === "string"
    && typeof record.confidence === "number"
    && Boolean(record.primaryFailure)
    && Array.isArray(record.evidence)
    && Boolean(record.compression)
    && typeof record.compression?.packetEstimatedTokens === "number";
}
