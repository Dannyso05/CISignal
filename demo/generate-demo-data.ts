import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { analyze } from "../src/analysis/analyze.js";
import { aggregateHistory } from "../src/history/aggregate.js";
import type { FailureKind, FailureRecord } from "../src/types.js";

const TOTAL_LINES = 72_418;
const PRIMARY_START = 42_002;
const PRIMARY_END = 42_010;
const SEED_DEFAULT = 20_260_823;

function seedFromArgs(): number {
  const index = process.argv.indexOf("--seed");
  return index >= 0 ? Number(process.argv[index + 1]) : SEED_DEFAULT;
}

function createLog(): string {
  const lines: string[] = [
    "2026-08-23T18:00:00.000Z [runner] Starting CI job auth-tests",
    "2026-08-23T18:00:00.100Z [runner] npm ci",
  ];
  while (lines.length < 41_999) {
    const index = lines.length + 1;
    lines.push(`2026-08-23T18:${String(Math.floor(index / 60) % 60).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z [cache] restored harmless package entry ${index % 173}`);
  }
  lines.push("2026-08-23T18:12:31.000Z [test] running authentication suite"); // 42000
  lines.push("FAIL tests/auth/token.test.ts"); // 42001
  lines.push("  ● token expiry › rejects a token exactly at its expiration boundary"); // 42002
  lines.push("");
  lines.push("    expect(received).toBe(expected) // Object.is equality");
  lines.push("");
  lines.push("    Expected: 401");
  lines.push("    Received: 200");
  lines.push("");
  lines.push("      at Object.<anonymous> (tests/auth/token.test.ts:42:18)");
  lines.push(""); // 42010
  lines.push("  ● auth fixture cascade › rejects an expired refresh token");
  lines.push("    Error: shared auth fixture remained authenticated after origin failure");
  lines.push("      at createAuthContext (tests/auth/fixture.ts:71:9)");
  lines.push("");
  lines.push("  ● auth fixture cascade › clears the session cookie");
  lines.push("    Error: shared auth fixture remained authenticated after origin failure");
  lines.push("      at createAuthContext (tests/auth/fixture.ts:71:9)");
  lines.push("");
  lines.push("  ● auth fixture cascade › denies an expired API session");
  lines.push("    Error: shared auth fixture remained authenticated after origin failure");
  lines.push("      at createAuthContext (tests/auth/fixture.ts:71:9)");
  lines.push("Tests: 4 failed, 18 passed, 22 total");
  while (lines.length < TOTAL_LINES - 1) {
    const index = lines.length + 1;
    lines.push(index % 17 === 0
      ? "\u001b[33mwarning\u001b[0m package metadata cache already populated"
      : `2026-08-23T18:19:${String(index % 60).padStart(2, "0")}.000Z [reporter] harmless coverage detail ${index % 257}`);
  }
  lines.push("Error: Process completed with exit code 1");
  return lines.join("\n");
}

const diff = `diff --git a/src/auth/token.ts b/src/auth/token.ts
index 7f9d2a1..816fb52 100644
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -28,7 +28,7 @@ export function isExpired(expiresAt: number, now: number): boolean {
-  return expiresAt <= now;
+  return expiresAt < now;
 }`;

function cloneRecord(base: FailureRecord, index: number, kind: FailureKind, options: { success?: boolean; cascades?: number; sameFingerprint?: boolean } = {}): FailureRecord {
  const record = structuredClone(base);
  record.runId = `history-${String(index + 1).padStart(3, "0")}`;
  record.startedAt = new Date(Date.UTC(2026, 6, 1 + index, 12, 0, 0)).toISOString();
  record.completedAt = new Date(Date.UTC(2026, 6, 1 + index, 12, 7 + (index % 9), 0)).toISOString();
  record.attemptNumber = options.success ? 2 : 1;
  record.conclusion = options.success ? "success" : "failure";
  record.classification = kind;
  record.primaryFailure.kind = kind;
  if (!options.sameFingerprint) {
    record.fingerprint = createHash("sha256").update(`${kind}|scenario-${index % 5}`).digest("hex");
    record.primaryFailure.message = `${kind.replaceAll("_", " ")} synthetic scenario ${index % 5}`;
  }
  if (options.success) record.limitations.push("successful rerun without relevant code changes");
  record.cascadingFailures = record.cascadingFailures.slice(0, options.cascades ?? record.cascadingFailures.length);
  return record;
}

async function main(): Promise<void> {
  const seed = seedFromArgs();
  if (seed !== SEED_DEFAULT) throw new Error(`This demo release is pinned to seed ${SEED_DEFAULT}; received ${seed}`);
  const root = resolve(import.meta.dirname, "..");
  const fixtureDir = resolve(root, "fixtures/noisy-jest-run");
  const historyDir = resolve(root, "fixtures/history/runs");
  const outputDir = resolve(root, "work/demo-run");
  const dashboardDataDir = resolve(root, "dashboard/public/data");
  await Promise.all([mkdir(fixtureDir, { recursive: true }), mkdir(historyDir, { recursive: true }), mkdir(outputDir, { recursive: true }), mkdir(dashboardDataDir, { recursive: true })]);
  await rm(historyDir, { recursive: true, force: true });
  await mkdir(historyDir, { recursive: true });

  const log = createLog();
  const checksum = createHash("sha256").update(log).digest("hex");
  const result = analyze({
    logs: log,
    diff,
    runId: "demo-run-001",
    repository: "Dannyso05/CISignal",
    headSha: "demo-expiry-boundary",
    baseSha: "demo-base",
    tokenBudget: 2000,
  });
  const history: FailureRecord[] = [];
  for (let index = 0; index < 8; index += 1) history.push(cloneRecord(result.report, index, "assertion_failure", { sameFingerprint: true, cascades: 3 }));
  for (let index = 8; index < 11; index += 1) history.push(cloneRecord(result.report, index, "assertion_failure", { success: true, sameFingerprint: true, cascades: 0 }));
  for (let index = 11; index < 16; index += 1) history.push(cloneRecord(result.report, index, "typecheck_error", { cascades: 0 }));
  for (let index = 16; index < 20; index += 1) history.push(cloneRecord(result.report, index, "dependency_error", { cascades: 0 }));
  for (let index = 20; index < 24; index += 1) history.push(cloneRecord(result.report, index, "test_failure", { cascades: 3 }));
  const insights = aggregateHistory(history, true);

  const manifest = {
    demoVersion: "1.0.0",
    seed,
    generatorVersion: "0.1.0",
    schemaVersion: "0.1",
    scenario: "expired-token-regression",
    synthetic: true,
    fixtureSha256: checksum,
    expectedPrimaryFile: "tests/auth/token.test.ts",
    expectedRelatedFile: "src/auth/token.ts",
  };
  const expected = {
    fingerprint: result.report.fingerprint,
    classification: "assertion_failure",
    evidenceRange: [PRIMARY_START, PRIMARY_END],
    relatedFile: "src/auth/token.ts",
    maxPacketTokens: 2000,
    rawLines: TOTAL_LINES,
    insightIds: ["cheap-checks-earlier", "recurring-failure", "cascade-hotspot", "potential-flake", "dependency-instability"].sort(),
  };
  const dashboard = {
    demoVersion: "1.0.0",
    generatedAt: "2026-08-23T18:30:00.000Z",
    synthetic: true,
    deployedCommit: "visible after Vercel build",
    currentRun: result.report,
    insights,
    history: history.map((record) => ({ runId: record.runId, classification: record.classification, fingerprint: record.fingerprint, conclusion: record.conclusion, attemptNumber: record.attemptNumber, cascadingFailures: record.cascadingFailures.length })),
    contextPacket: result.context,
  };

  await Promise.all([
    writeFile(resolve(fixtureDir, "ci.log"), log),
    writeFile(resolve(fixtureDir, "commit.diff"), `${diff}\n`),
    writeFile(resolve(fixtureDir, "expected.json"), `${JSON.stringify(expected, null, 2)}\n`),
    writeFile(resolve(root, "demo/demo-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(resolve(root, "demo/expected-metrics.json"), `${JSON.stringify(expected, null, 2)}\n`),
    writeFile(resolve(outputDir, "report.json"), `${JSON.stringify(result.report, null, 2)}\n`),
    writeFile(resolve(outputDir, "history-record.json"), `${JSON.stringify(result.report, null, 2)}\n`),
    writeFile(resolve(outputDir, "context.md"), `${result.context}\n`),
    writeFile(resolve(outputDir, "summary.md"), result.summary),
    writeFile(resolve(outputDir, "insights.json"), `${JSON.stringify(insights, null, 2)}\n`),
    writeFile(resolve(root, "fixtures/history/manifest.json"), `${JSON.stringify({ synthetic: true, seed, runCount: history.length }, null, 2)}\n`),
    writeFile(resolve(dashboardDataDir, "demo-dashboard.json"), `${JSON.stringify(dashboard, null, 2)}\n`),
  ]);
  await Promise.all(history.map((record) => writeFile(resolve(historyDir, `${record.runId}.json`), `${JSON.stringify(record, null, 2)}\n`)));
  process.stdout.write(`Generated deterministic SignalCI demo: ${TOTAL_LINES.toLocaleString()} raw lines → ${result.report.compression.packetEstimatedTokens.toLocaleString()} estimated packet tokens.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
