import type { FailureRecord } from "../types.js";
import { stripAnsi } from "../normalize/ansi.js";

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderPullRequestComment(record: FailureRecord): string {
  const primary = record.primaryFailure;
  const evidence = record.evidence.find((span) => span.eventId === primary.id) ?? record.evidence[0];
  const related = record.relatedChanges[0];
  const citation = primary.rawStart === primary.rawEnd
    ? `raw line ${primary.rawStart}`
    : `raw lines ${primary.rawStart}–${primary.rawEnd}`;
  const evidenceText = stripAnsi(evidence?.text ?? "No bounded evidence span was available.");
  const contextPackaging = record.compression.reductionPercent >= 0
    ? `${record.compression.rawEstimatedTokens.toLocaleString()} → **${record.compression.packetEstimatedTokens.toLocaleString()} estimated tokens** (${record.compression.reductionPercent.toFixed(2)}%)`
    : `${record.compression.rawEstimatedTokens.toLocaleString()} raw estimated tokens; short input, so fixed report metadata outweighs compression`;

  return `<!-- signalci-pr-report -->
## SignalCI failure intelligence

> **Likely originating failure** · ${Math.round(record.confidence * 100)}% heuristic confidence · ${citation}

| Signal | Result |
| --- | --- |
| Classification | \`${record.classification}\` |
| Failure | **${escapeTable(primary.testName ?? primary.message)}** |
| Location | \`${primary.file ?? "unknown"}${primary.sourceLine ? `:${primary.sourceLine}` : ""}\` |
| Likely related change | ${related ? `\`${related.file}\` — ${escapeTable(related.reasons.join("; "))}` : "No changed file crossed the correlation threshold"} |
| Cascades collapsed | ${record.cascadingFailures.length} |
| Context packaging | ${contextPackaging} |
| Reproduction | \`${record.reproduce?.command ?? "not safely derivable"}\` (${record.reproduce?.verified ? "verified" : "unverified"}) |

<details>
<summary><strong>Exact cited evidence</strong></summary>

\`\`\`text
${evidenceText}
\`\`\`

</details>

<details>
<summary><strong>Why SignalCI ranked this first</strong></summary>

${primary.evidenceReasons.map((reason) => `- ${reason}`).join("\n")}

</details>

**Suggested next action:** inspect the likely related change, apply the smallest fix, then run \`${record.reproduce?.command ?? "the focused failing check"}\`.

_Inference is not causation. Logs and diffs are treated as untrusted data; secrets are redacted before this comment is generated._

[Open the SignalCI dashboard](https://ci-signal.vercel.app) · Download the full report from this workflow's artifacts.
`;
}
