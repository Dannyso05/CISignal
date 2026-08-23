import type { AnalyzeInput, AnalyzeResult, EvidenceSpan, FailureEvent, FailureRecord } from "../types.js";
import { SCHEMA_VERSION } from "../config.js";
import { normalizeLog } from "../normalize/lines.js";
import { redactSecrets } from "../normalize/redact.js";
import { JestParser } from "../parsers/jest.js";
import { PytestParser } from "../parsers/pytest.js";
import { TypeScriptParser } from "../parsers/typescript.js";
import { GenericParser } from "../parsers/generic.js";
import { parseDiff } from "../diff/parse-diff.js";
import { deduplicate, scoreEvents } from "./rank.js";
import { detectCascades } from "./cascade.js";
import { correlationForEvent } from "./correlate.js";
import { fingerprintEvent } from "./fingerprint.js";
import { estimateTokens } from "../packing/estimate-tokens.js";
import { renderContext } from "../packing/render-context.js";
import { renderSummary } from "../reports/markdown.js";

const parsers = [new JestParser(), new PytestParser(), new TypeScriptParser(), new GenericParser()];

function confidenceFor(primary: FailureEvent, runnerUp?: FailureEvent): number {
  const gap = primary.score - (runnerUp?.score ?? 0);
  const base = primary.kind === "assertion_failure" ? 0.78 : primary.kind === "typecheck_error" ? 0.75 : 0.56;
  return Math.min(0.96, Math.max(0.35, base + Math.min(0.16, Math.max(0, gap) * 0.012)));
}

function evidenceFor(events: FailureEvent[], lines: ReturnType<typeof normalizeLog>): EvidenceSpan[] {
  return events.slice(0, 8).map((event, index) => {
    const start = Math.max(1, event.rawStart);
    const end = Math.min(lines.length, Math.max(event.rawEnd, start));
    const text = redactSecrets(lines.slice(start - 1, end).map((line) => line.raw).join("\n"));
    return {
      id: `evidence-${index + 1}`,
      eventId: event.id,
      rawStart: start,
      rawEnd: end,
      text,
      estimatedTokens: estimateTokens(text),
    };
  });
}

export function analyze(input: AnalyzeInput): AnalyzeResult {
  const lines = normalizeLog(input.logs);
  const changedFiles = parseDiff(input.diff);
  const parsed = parsers.flatMap((parser) => parser.parse(lines)).map((event) => ({
    ...event,
    message: redactSecrets(event.message),
    testName: event.testName ? redactSecrets(event.testName) : undefined,
  }));
  const ranked = scoreEvents(deduplicate(parsed), changedFiles);
  const primary = ranked.find((event) => !event.duplicateOf);
  if (!primary) throw new Error("No meaningful failure found in the supplied log");

  const withCascades = detectCascades(primary, ranked);
  const primaryWithCascadeInfo = withCascades.find((event) => event.id === primary.id) ?? primary;
  const cascades = withCascades.filter((event) => event.cascadeOf === primary.id && !event.duplicateOf);
  const alternatives = withCascades.filter((event) => event.id !== primary.id && !event.cascadeOf && !event.duplicateOf).slice(0, 8);
  const evidence = evidenceFor([primaryWithCascadeInfo, ...cascades, ...alternatives], lines);
  const rawEstimatedTokens = estimateTokens(input.logs);
  const limitations = [
    "The likely origin is selected with transparent heuristics; correlation does not prove causation.",
    "Reproduction has not been executed by the deterministic analyzer.",
    "Only bounded evidence spans are persisted; complete raw logs remain at their source.",
  ];

  const report: FailureRecord = {
    schemaVersion: SCHEMA_VERSION,
    runId: input.runId,
    repository: input.repository,
    pullRequest: input.pullRequest,
    headSha: input.headSha,
    baseSha: input.baseSha,
    attemptNumber: input.attemptNumber ?? 1,
    conclusion: "failure",
    classification: primary.kind,
    fingerprint: fingerprintEvent(primary),
    confidence: confidenceFor(primary, ranked.find((event) => event.id !== primary.id)),
    primaryFailure: primaryWithCascadeInfo,
    cascadingFailures: cascades,
    alternativeFailures: alternatives,
    changedFiles,
    relatedChanges: correlationForEvent(primary, changedFiles),
    evidence,
    reproduce: primary.framework === "jest" && primary.file
      ? { command: `npm test -- ${primary.file}`, confidence: 0.72, verified: false }
      : primary.framework === "pytest" && primary.file
        ? { command: `python -m pytest ${primary.file}${primary.testName ? `::${primary.testName}` : ""}`, confidence: 0.78, verified: false }
        : undefined,
    compression: {
      rawLines: lines.length,
      rawBytes: Buffer.byteLength(input.logs),
      rawEstimatedTokens,
      packetEstimatedTokens: 0,
      reductionPercent: 0,
    },
    limitations,
  };

  let context = renderContext(report, input.tokenBudget);
  report.compression.packetEstimatedTokens = estimateTokens(context);
  report.compression.reductionPercent = rawEstimatedTokens === 0
    ? 0
    : Number(((1 - report.compression.packetEstimatedTokens / rawEstimatedTokens) * 100).toFixed(2));
  context = renderContext(report, input.tokenBudget);
  report.compression.packetEstimatedTokens = estimateTokens(context);
  report.compression.reductionPercent = rawEstimatedTokens === 0
    ? 0
    : Number(((1 - report.compression.packetEstimatedTokens / rawEstimatedTokens) * 100).toFixed(2));

  return { report, context, summary: renderSummary(report) };
}
