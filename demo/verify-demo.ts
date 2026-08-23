import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateFailureRecord } from "../src/reports/json.js";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Demo verification failed: ${message}`);
}

async function json(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, "..");
  const report = await json(resolve(root, "work/demo-run/report.json"));
  const expected = await json(resolve(root, "demo/expected-metrics.json"));
  const dashboard = await json(resolve(root, "dashboard/public/data/demo-dashboard.json"));
  check(validateFailureRecord(report), "report schema");
  check(report.fingerprint === expected.fingerprint, "primary fingerprint");
  check(report.classification === expected.classification, "classification");
  check(report.primaryFailure.rawStart === expected.evidenceRange[0] && report.primaryFailure.rawEnd === expected.evidenceRange[1], "exact raw evidence range");
  check(report.relatedChanges[0]?.file === expected.relatedFile, "related source file");
  check(report.compression.rawLines === expected.rawLines, "raw line count");
  check(report.compression.packetEstimatedTokens <= expected.maxPacketTokens, "packet token budget");
  const reduction = Number(((1 - report.compression.packetEstimatedTokens / report.compression.rawEstimatedTokens) * 100).toFixed(2));
  check(report.compression.reductionPercent === reduction, "compression math");
  const actualInsightIds = dashboard.insights.recommendations.map((item: any) => item.id).sort();
  check(JSON.stringify(actualInsightIds) === JSON.stringify(expected.insightIds), "expected evidence-backed insights");
  check(dashboard.synthetic === true && dashboard.insights.generatedFrom === "synthetic-demo", "synthetic labels");
  process.stdout.write(`Demo verified: ${report.compression.rawLines.toLocaleString()} lines, ${report.compression.packetEstimatedTokens} tokens, ${report.compression.reductionPercent}% reduction, ${actualInsightIds.length} recommendations.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
