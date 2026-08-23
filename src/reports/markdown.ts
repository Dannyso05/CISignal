import type { FailureRecord } from "../types.js";

export function renderSummary(record: FailureRecord): string {
  const primary = record.primaryFailure;
  return `# CISignal analysis: ${record.runId}\n\n- Likely origin: **${primary.testName ?? primary.message}**\n- Classification: ${record.classification}\n- Confidence: ${Math.round(record.confidence * 100)}%\n- Evidence: raw lines ${primary.rawStart}–${primary.rawEnd}\n- Related change: ${record.relatedChanges[0]?.file ?? "none identified"}\n- Cascades collapsed: ${record.cascadingFailures.length}\n- Context: ${record.compression.rawEstimatedTokens.toLocaleString()} → ${record.compression.packetEstimatedTokens.toLocaleString()} estimated tokens (${record.compression.reductionPercent.toFixed(2)}% reduction)\n- Reproduction: \`${record.reproduce?.command ?? "unavailable"}\` (${record.reproduce?.verified ? "verified" : "unverified"})\n`;
}
