#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyze } from "./analysis/analyze.js";
import { JsonFailureStore } from "./history/json-store.js";
import { aggregateHistory } from "./history/aggregate.js";
import { validateFailureRecord } from "./reports/json.js";
import type { FailureRecord } from "./types.js";

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

async function main(): Promise<void> {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  if (command === "analyze") return analyzeCommand([subcommand, ...rest].filter(Boolean));
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
