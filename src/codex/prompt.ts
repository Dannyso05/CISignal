import type { FailureRecord } from "../types.js";
import { renderContext } from "../packing/render-context.js";

export function createCodexHandoff(record: FailureRecord, tokenBudget = 2000): { prompt: string; command: string } {
  const context = renderContext(record, tokenBudget);
  const prompt = `${context}\n\n## Required response\n\nReturn a diagnosis, the minimal proposed files, explicit verification commands, verification status, and remaining limitations. Do not push, merge, or expose credentials.`;
  const command = "codex exec --sandbox workspace-write --output-schema schemas/codex-result.schema.json --output-last-message work/codex-result.json - < work/codex-prompt.md";
  return { prompt, command };
}
