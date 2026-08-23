import type { FailureRecord, InsightReport } from "../types.js";
import { buildRecommendations } from "./recommendations.js";

export function aggregateHistory(records: FailureRecord[], synthetic = false): InsightReport {
  const failed = records.filter((record) => record.conclusion === "failure");
  const fingerprints = new Map<string, number>();
  const categoryCounts: Record<string, number> = {};
  for (const record of failed) {
    fingerprints.set(record.fingerprint, (fingerprints.get(record.fingerprint) ?? 0) + 1);
    categoryCounts[record.classification] = (categoryCounts[record.classification] ?? 0) + 1;
  }
  return {
    schemaVersion: "0.1",
    generatedFrom: synthetic ? "synthetic-demo" : "stored-runs",
    totalRuns: records.length,
    failedRuns: failed.length,
    firstAttemptFailureRate: Number((failed.filter((record) => (record.attemptNumber ?? 1) === 1).length / Math.max(1, records.length)).toFixed(3)),
    uniqueFingerprints: fingerprints.size,
    recurringFingerprints: [...fingerprints.values()].filter((count) => count >= 3).length,
    potentialFlakes: buildRecommendations(records).some((recommendation) => recommendation.id === "potential-flake") ? 1 : 0,
    categoryCounts,
    recommendations: buildRecommendations(records),
  };
}
