import type { FailureRecord, Recommendation } from "../types.js";

function groupByFingerprint(records: FailureRecord[]): Map<string, FailureRecord[]> {
  const groups = new Map<string, FailureRecord[]>();
  for (const record of records) groups.set(record.fingerprint, [...(groups.get(record.fingerprint) ?? []), record]);
  return groups;
}

export function buildRecommendations(records: FailureRecord[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const groups = [...groupByFingerprint(records).entries()].sort((a, b) => b[1].length - a[1].length);
  const recurring = groups.find(([, runs]) => runs.length >= 3);
  if (recurring) {
    const [fingerprint, runs] = recurring;
    recommendations.push({
      id: "recurring-failure",
      type: "recurrence",
      title: "Eliminate the recurring token-expiration failure",
      explanation: `The same normalized failure fingerprint appears in ${runs.length} stored runs.`,
      evidence: runs.slice(0, 6).map((record) => ({ runId: record.runId, fingerprint, metric: "same stable fingerprint" })),
      action: "Freeze time in the test and centralize token-expiry boundary fixtures.",
      confidence: Math.min(0.95, 0.68 + runs.length * 0.025),
      estimatedImpact: {
        value: runs.length,
        unit: "runs",
        methodology: "Count of stored runs sharing the stable normalized fingerprint.",
      },
      caveats: ["Synthetic demo history illustrates the rule; production impact requires production run data."],
    });
  }

  const rerunPasses = records.filter((record) => record.conclusion === "success" || record.limitations.includes("successful rerun without relevant code changes"));
  if (rerunPasses.length >= 2) {
    recommendations.push({
      id: "potential-flake",
      type: "flake",
      title: "Investigate a potentially time-dependent test",
      explanation: `${rerunPasses.length} stored reruns passed without a relevant code change after a matching failure.`,
      evidence: rerunPasses.slice(0, 5).map((record) => ({ runId: record.runId, fingerprint: record.fingerprint, metric: "rerun passed without relevant change" })),
      action: "Inject a fixed clock and rerun the test repeatedly before classifying it as flaky.",
      confidence: 0.78,
      estimatedImpact: {
        value: Math.round((rerunPasses.length / Math.max(1, records.length)) * 100),
        unit: "percent",
        methodology: "Matching rerun-pass records divided by all stored demonstration runs.",
      },
      caveats: ["A rerun pass is evidence of potential flakiness, not definitive proof."],
    });
  }

  const typeFailures = records.filter((record) => record.classification === "typecheck_error");
  if (typeFailures.length >= 3) {
    recommendations.push({
      id: "cheap-checks-earlier",
      type: "workflow",
      title: "Move typecheck ahead of expensive integration jobs",
      explanation: `${typeFailures.length} first-attempt failures were deterministic type errors recorded after slower jobs had started.`,
      evidence: typeFailures.slice(0, 5).map((record) => ({ runId: record.runId, fingerprint: record.fingerprint, metric: "typecheck failure in late stage" })),
      action: "Make typecheck an early required job and gate integration fan-out on it.",
      confidence: 0.84,
      estimatedImpact: {
        value: typeFailures.length * 4,
        unit: "minutes_per_month",
        methodology: "Four avoidable integration-run minutes per observed late typecheck failure.",
      },
      caveats: ["Timing impact is an estimate derived from synthetic job durations."],
    });
  }

  const cascadeRuns = records.filter((record) => record.cascadingFailures.length >= 3);
  if (cascadeRuns.length >= 2) {
    recommendations.push({
      id: "cascade-hotspot",
      type: "workflow",
      title: "Fail fast when the shared auth fixture breaks",
      explanation: `${cascadeRuns.length} runs contain at least three downstream failures beneath one likely origin.`,
      evidence: cascadeRuns.slice(0, 5).map((record) => ({ runId: record.runId, fingerprint: record.fingerprint, metric: `${record.cascadingFailures.length} collapsed cascades` })),
      action: "Add a focused fixture health check before the broader authentication suite.",
      confidence: 0.8,
      caveats: ["Cascade detection is conservative and heuristic."],
    });
  }

  const dependencyRuns = records.filter((record) => record.classification === "dependency_error");
  if (dependencyRuns.length >= 3) {
    recommendations.push({
      id: "dependency-instability",
      type: "reliability",
      title: "Harden dependency installation",
      explanation: `${dependencyRuns.length} stored runs failed during registry or dependency resolution.`,
      evidence: dependencyRuns.slice(0, 5).map((record) => ({ runId: record.runId, fingerprint: record.fingerprint, metric: "dependency/registry classification" })),
      action: "Enforce frozen lockfiles, cache verified packages, and retry only transient registry failures.",
      confidence: 0.72,
      caveats: ["Retry policy should not mask deterministic lockfile or integrity failures."],
    });
  }

  return recommendations.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}
