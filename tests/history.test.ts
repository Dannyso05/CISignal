import { describe, expect, it } from "vitest";
import { analyze } from "../src/analysis/analyze.js";
import { aggregateHistory } from "../src/history/aggregate.js";
import { buildRecommendations } from "../src/history/recommendations.js";
import type { FailureRecord } from "../src/types.js";

const base = analyze({
  logs: "FAIL tests/demo.test.ts\n  ● demo › fails\n    Expected: true\n    Received: false\n    at Object.<anonymous> (tests/demo.test.ts:4:2)",
  diff: "",
  runId: "base",
  tokenBudget: 1000,
}).report;

function records(count: number): FailureRecord[] {
  return Array.from({ length: count }, (_, index) => ({ ...structuredClone(base), runId: `run-${index + 1}` }));
}

describe("historical insights", () => {
  it("aggregates recurring stable fingerprints", () => {
    const insights = aggregateHistory(records(4));
    expect(insights.recurringFingerprints).toBe(1);
    expect(insights.recommendations.some((item) => item.id === "recurring-failure")).toBe(true);
  });

  it("flags rerun passes as potential—not definitive—flakes", () => {
    const history = records(5);
    history[3].conclusion = "success";
    history[3].limitations.push("successful rerun without relevant code changes");
    history[4].conclusion = "success";
    history[4].limitations.push("successful rerun without relevant code changes");
    const recommendation = buildRecommendations(history).find((item) => item.id === "potential-flake");
    expect(recommendation?.title).toContain("potentially");
    expect(recommendation?.caveats.join(" ")).toContain("not definitive proof");
  });

  it("never emits a recommendation without supporting run evidence", () => {
    for (const recommendation of buildRecommendations(records(4))) expect(recommendation.evidence.length).toBeGreaterThan(0);
  });
});
