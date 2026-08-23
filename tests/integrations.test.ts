import { describe, expect, it } from "vitest";
import { analyze } from "../src/analysis/analyze.js";
import { createCodexHandoff } from "../src/codex/prompt.js";
import { collectGitHubRun } from "../src/github/collect-run.js";
import { renderPullRequestComment } from "../src/reports/pr-comment.js";

describe("optional integrations", () => {
  it("emits an explicit bounded Codex command without running it", () => {
    const report = analyze({ logs: "fatal Error: demo failed", diff: "", runId: "handoff", tokenBudget: 900 }).report;
    const handoff = createCodexHandoff(report, 900);
    expect(handoff.prompt).toContain("Required response");
    expect(handoff.command).toContain("--sandbox workspace-write");
    expect(handoff.command).toContain("--output-schema schemas/codex-result.schema.json");
  });

  it("rejects an invalid GitHub repository target before network access", async () => {
    await expect(collectGitHubRun({ repository: "not-a-repository", runId: "1", baseSha: "base", headSha: "head", tokenBudget: 2000, token: "test" })).rejects.toThrow("owner/name");
  });

  it("renders a PR comment with citations, packaging context, and limitations", () => {
    const report = analyze({ logs: "fatal Error: demo failed", diff: "", runId: "pr-demo", tokenBudget: 900 }).report;
    report.evidence[0].text = "\u001b[31mfatal Error: demo failed\u001b[0m";
    const comment = renderPullRequestComment(report);
    expect(comment).toContain("<!-- signalci-pr-report -->");
    expect(comment).toContain("Likely originating failure");
    expect(comment).toContain("Context packaging");
    expect(comment).toContain("short input");
    expect(comment).not.toContain("\u001b[31m");
    expect(comment).toContain("Inference is not causation");
  });
});
