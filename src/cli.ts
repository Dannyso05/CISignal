#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyze } from "./analysis/analyze.js";
import { JsonFailureStore } from "./history/json-store.js";
import { aggregateHistory } from "./history/aggregate.js";
import { validateFailureRecord } from "./reports/json.js";
import type { FailureRecord } from "./types.js";
import { collectGitHubRun } from "./github/collect-run.js";
import { createCodexHandoff } from "./codex/prompt.js";
import { renderPullRequestComment } from "./reports/pr-comment.js";

function options(args: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument.startsWith("--")) values.set(argument.slice(2), args[index + 1]?.startsWith("--") ? "true" : (args[++index] ?? "true"));
  }
  return values;
}

function requireOption(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (!value) throw new Error(`Missing required option --${name}`);
  return value;
}

async function analyzeCommand(args: string[]): Promise<void> {
  const values = options(args);
  const outputDir = resolve(values.get("output-dir") ?? "work/demo-run");
  const result = analyze({
    logs: await readFile(resolve(requireOption(values, "logs")), "utf8"),
    diff: await readFile(resolve(requireOption(values, "diff")), "utf8"),
    runId: requireOption(values, "run-id"),
    repository: values.get("repository"),
    headSha: values.get("head-sha"),
    baseSha: values.get("base-sha"),
    tokenBudget: Number(values.get("token-budget") ?? 2000),
  });
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDir, "report.json"), `${JSON.stringify(result.report, null, 2)}\n`),
    writeFile(resolve(outputDir, "history-record.json"), `${JSON.stringify(result.report, null, 2)}\n`),
    writeFile(resolve(outputDir, "context.md"), `${result.context}\n`),
    writeFile(resolve(outputDir, "summary.md"), result.summary),
  ]);
  process.stdout.write(`${result.summary}\nArtifacts: ${outputDir}\n`);
}

async function writeAnalysis(result: ReturnType<typeof analyze>, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDir, "report.json"), `${JSON.stringify(result.report, null, 2)}\n`),
    writeFile(resolve(outputDir, "history-record.json"), `${JSON.stringify(result.report, null, 2)}\n`),
    writeFile(resolve(outputDir, "context.md"), `${result.context}\n`),
    writeFile(resolve(outputDir, "summary.md"), result.summary),
  ]);
}

async function main(): Promise<void> {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  if (command === "analyze") return analyzeCommand([subcommand, ...rest].filter(Boolean));
  if (command === "github" && subcommand === "analyze") {
    const values = options(rest);
    const outputDir = resolve(values.get("output-dir") ?? "work/github-run");
    const input = await collectGitHubRun({
      repository: requireOption(values, "repository"),
      runId: requireOption(values, "run-id"),
      baseSha: requireOption(values, "base-sha"),
      headSha: requireOption(values, "head-sha"),
      tokenBudget: Number(values.get("token-budget") ?? 2000),
    });
    const result = analyze(input);
    await writeAnalysis(result, outputDir);
    process.stdout.write(`${result.summary}\nArtifacts: ${outputDir}\n`);
    return;
  }
  if (command === "diagnose") {
    const values = options([subcommand, ...rest].filter(Boolean));
    const reportValue: unknown = JSON.parse(await readFile(resolve(requireOption(values, "report")), "utf8"));
    if (!validateFailureRecord(reportValue)) throw new Error("Diagnosis input is not a valid SignalCI report");
    const outputDir = resolve(values.get("output-dir") ?? "work");
    const handoff = createCodexHandoff(reportValue, Number(values.get("token-budget") ?? 2000));
    await mkdir(outputDir, { recursive: true });
    await writeFile(resolve(outputDir, "codex-prompt.md"), `${handoff.prompt}\n`);
    process.stdout.write(`Wrote bounded Codex handoff to ${resolve(outputDir, "codex-prompt.md")}\nRun explicitly if desired:\n${handoff.command}\n`);
    return;
  }
  if (command === "render-pr-comment") {
    const values = options([subcommand, ...rest].filter(Boolean));
    const reportValue: unknown = JSON.parse(await readFile(resolve(requireOption(values, "report")), "utf8"));
    if (!validateFailureRecord(reportValue)) throw new Error("PR comment input is not a valid SignalCI report");
    const output = resolve(values.get("output") ?? "work/pr-comment.md");
    await mkdir(resolve(output, ".."), { recursive: true });
    await writeFile(output, renderPullRequestComment(reportValue));
    process.stdout.write(`Wrote PR-formatted SignalCI report to ${output}\n`);
    return;
  }
  if (command === "validate") {
    const value: unknown = JSON.parse(await readFile(resolve(subcommand), "utf8"));
    if (!validateFailureRecord(value)) throw new Error("Report failed schema validation");
    process.stdout.write("SignalCI report is valid.\n");
    return;
  }
  if (command === "history" && subcommand === "ingest") {
    const file = rest[0];
    const record: unknown = JSON.parse(await readFile(resolve(file), "utf8"));
    if (!validateFailureRecord(record)) throw new Error("History record is invalid");
    const values = options(rest.slice(1));
    await new JsonFailureStore(resolve(values.get("store") ?? "data/history")).put(record);
    process.stdout.write(`Ingested ${(record as FailureRecord).runId}.\n`);
    return;
  }
  if (command === "history" && subcommand === "insights") {
    const values = options(rest);
    const store = new JsonFailureStore(resolve(values.get("store") ?? "data/history"));
    const output = resolve(values.get("output") ?? "work/insights.json");
    const insights = aggregateHistory(await store.list());
    await mkdir(resolve(output, ".."), { recursive: true });
    await writeFile(output, `${JSON.stringify(insights, null, 2)}\n`);
    process.stdout.write(`Wrote ${insights.recommendations.length} evidence-backed recommendations to ${output}.\n`);
    return;
  }
  process.stderr.write("Usage: signalci analyze --logs FILE --diff FILE --run-id ID [--token-budget 2000 --output-dir DIR]\n");
  process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`SignalCI: ${message}\n`);
  process.exitCode = /Missing required option/.test(message) ? 2 : /No meaningful failure/.test(message) ? 4 : 1;
});
