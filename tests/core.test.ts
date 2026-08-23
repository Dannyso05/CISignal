import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripAnsi } from "../src/normalize/ansi.js";
import { normalizeLog } from "../src/normalize/lines.js";
import { JestParser } from "../src/parsers/jest.js";
import { PytestParser } from "../src/parsers/pytest.js";
import { TypeScriptParser } from "../src/parsers/typescript.js";
import { GenericParser } from "../src/parsers/generic.js";
import { deduplicate, scoreEvents } from "../src/analysis/rank.js";
import { detectCascades } from "../src/analysis/cascade.js";
import { parseDiff } from "../src/diff/parse-diff.js";
import { fingerprintEvent } from "../src/analysis/fingerprint.js";
import { analyze } from "../src/analysis/analyze.js";
import type { FailureEvent } from "../src/types.js";

const diff = `diff --git a/src/auth/token.ts b/src/auth/token.ts
--- a/src/auth/token.ts
+++ b/src/auth/token.ts
@@ -8,2 +8,2 @@
-return expiresAt <= now
+return expiresAt < now`;

const jestLog = `FAIL tests/auth/token.test.ts
  ● token expiry › rejects an expired token

    expect(received).toBe(expected)

    Expected: 401
    Received: 200

      at Object.<anonymous> (tests/auth/token.test.ts:42:18)
Error: Process completed with exit code 1`;

const vitestLog = ` ❯ tests/auth/token.test.ts (1 test | 1 failed) 3ms
     × rejects a token exactly at its expiration boundary 3ms

 FAIL  tests/auth/token.test.ts > token expiry > rejects a token exactly at its expiration boundary
AssertionError: expected 200 to be 401 // Object.is equality

 ❯ tests/auth/token.test.ts:7:48
      7|     expect(statusForToken(boundary, boundary)).toBe(401);

 Test Files  1 failed (1)`;

const multiFailureVitestLog = ` ❯ tests/auth/token.test.ts (4 tests | 4 failed) 5ms
     × rejects a token exactly at its expiration boundary 2ms
     × auth context fixture rejects a refresh token at the same boundary 1ms
     × auth context fixture clears a session expired at the boundary 1ms
     × auth context fixture denies a protected request at the boundary 1ms

 FAIL  tests/auth/token.test.ts > token expiry > rejects a token exactly at its expiration boundary
AssertionError: expected 200 to be 401 // Object.is equality
 ❯ tests/auth/token.test.ts:8:48

 FAIL  tests/auth/token.test.ts > token expiry > auth context fixture rejects a refresh token at the same boundary
AssertionError: expected 200 to be 401 // Object.is equality
 ❯ tests/auth/token.test.ts:12:48

 FAIL  tests/auth/token.test.ts > token expiry > auth context fixture clears a session expired at the boundary
AssertionError: expected 200 to be 401 // Object.is equality
 ❯ tests/auth/token.test.ts:16:48

 FAIL  tests/auth/token.test.ts > token expiry > auth context fixture denies a protected request at the boundary
AssertionError: expected 200 to be 401 // Object.is equality
 ❯ tests/auth/token.test.ts:20:48

 Test Files  1 failed (1)`;

const pytestLog = `============================= test session starts ==============================
=================================== FAILURES ===================================
________________________ test_rejects_expired_token _________________________

    def test_rejects_expired_token():
>       assert status_for_token(100, 100) == 401
E       assert 200 == 401

tests/test_token.py:42: AssertionError
=========================== short test summary info ============================
FAILED tests/test_token.py::test_rejects_expired_token - assert 200 == 401
============================== 1 failed in 0.08s ===============================`;

describe("normalization", () => {
  it("removes ANSI formatting without mutating raw evidence", () => {
    const raw = "\u001b[31mFAIL\u001b[0m tests/demo.test.ts";
    const [line] = normalizeLog(raw);
    expect(stripAnsi(raw)).toBe("FAIL tests/demo.test.ts");
    expect(line.raw).toBe(raw);
    expect(line.normalized).toBe("FAIL tests/demo.test.ts");
    expect(line.index).toBe(1);
  });

  it("preserves stable one-based citations while normalizing timestamps and paths", () => {
    const lines = normalizeLog("first\n2026-08-23T18:00:00Z Error at /home/runner/work/repo/src/a.ts");
    expect(lines[1].index).toBe(2);
    expect(lines[1].timestamp).toBe("2026-08-23T18:00:00Z");
    expect(lines[1].normalized).toContain("<workspace>/src/a.ts");
  });
});

describe("parsers and ranking", () => {
  it("groups a Jest assertion, test name, and source location", () => {
    const [event] = new JestParser().parse(normalizeLog(jestLog));
    expect(event.kind).toBe("assertion_failure");
    expect(event.testName).toContain("rejects an expired token");
    expect(event.message).toContain("Expected: 401");
    expect(event.file).toBe("tests/auth/token.test.ts");
    expect(event.sourceLine).toBe(42);
  });

  it("groups a Vitest assertion with its suite and source location", () => {
    const [event] = new JestParser().parse(normalizeLog(vitestLog));
    expect(event.kind).toBe("assertion_failure");
    expect(event.testName).toBe("token expiry › rejects a token exactly at its expiration boundary");
    expect(event.message).toContain("expected 200 to be 401");
    expect(event.file).toBe("tests/auth/token.test.ts");
    expect(event.sourceLine).toBe(7);
  });

  it("parses detailed Vitest failure blocks and collapses downstream auth symptoms", () => {
    const events = new JestParser().parse(normalizeLog(multiFailureVitestLog));
    expect(events).toHaveLength(4);
    const result = analyze({ logs: multiFailureVitestLog, diff, runId: "vitest-cascade", tokenBudget: 1200 });
    expect(result.report.primaryFailure.testName).toBe("token expiry › rejects a token exactly at its expiration boundary");
    expect(result.report.cascadingFailures).toHaveLength(3);
  });

  it("groups a pytest assertion with its node id and source location", () => {
    const [event] = new PytestParser().parse(normalizeLog(pytestLog));
    expect(event.kind).toBe("assertion_failure");
    expect(event.testName).toBe("test_rejects_expired_token");
    expect(event.message).toBe("assert 200 == 401");
    expect(event.file).toBe("tests/test_token.py");
    expect(event.sourceLine).toBe(42);
  });

  it("derives a focused pytest reproduction command", () => {
    const result = analyze({ logs: pytestLog, diff: "", runId: "pytest", tokenBudget: 900 });
    expect(result.report.reproduce?.command).toBe("python -m pytest tests/test_token.py::test_rejects_expired_token");
  });

  it("extracts TypeScript compiler errors", () => {
    const [event] = new TypeScriptParser().parse(normalizeLog("src/config.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'."));
    expect(event.kind).toBe("typecheck_error");
    expect(event.file).toBe("src/config.ts");
    expect(event.sourceLine).toBe(12);
    expect(event.message).toContain("TS2322");
  });

  it("ranks a specific assertion above the final generic exit", () => {
    const lines = normalizeLog(jestLog);
    const events = [...new JestParser().parse(lines), ...new GenericParser().parse(lines)];
    const ranked = scoreEvents(deduplicate(events), parseDiff(diff));
    expect(ranked[0].kind).toBe("assertion_failure");
    expect(ranked.at(-1)?.kind).toBe("process_exit");
  });

  it("marks exact normalized failure duplicates", () => {
    const event: FailureEvent = { id: "one", kind: "unknown_error", framework: "generic", message: "fatal boom", rawStart: 1, rawEnd: 1, score: 0, evidenceReasons: [] };
    const result = deduplicate([event, { ...event, id: "two", rawStart: 2, rawEnd: 2 }]);
    expect(result[1].duplicateOf).toBe("one");
  });

  it("groups a later fixture failure beneath the likely origin", () => {
    const primary: FailureEvent = { id: "origin", kind: "assertion_failure", framework: "jest", testName: "origin", message: "expected 401", rawStart: 2, rawEnd: 5, score: 10, evidenceReasons: [] };
    const secondary: FailureEvent = { id: "later", kind: "test_failure", framework: "jest", testName: "auth fixture cascade", message: "setup failed", rawStart: 10, rawEnd: 11, score: 5, evidenceReasons: [] };
    expect(detectCascades(primary, [primary, secondary])[1].cascadeOf).toBe("origin");
  });
});

describe("diffs, fingerprints, and packing", () => {
  it("extracts changed files and new-line ranges from a unified diff", () => {
    const [file] = parseDiff(diff);
    expect(file.path).toBe("src/auth/token.ts");
    expect(file.kind).toBe("source");
    expect(file.changedRanges).toEqual([[8, 9]]);
  });

  it("boosts an event that directly references a changed file", () => {
    const event: FailureEvent = { id: "ts", kind: "typecheck_error", framework: "typescript", message: "TS2322", file: "src/auth/token.ts", rawStart: 1, rawEnd: 1, score: 0, evidenceReasons: [] };
    const [ranked] = scoreEvents([event], parseDiff(diff));
    expect(ranked.evidenceReasons).toContain("+5 event references changed file");
  });

  it("keeps a fingerprint stable across timestamps and source-line changes", () => {
    const base: FailureEvent = { id: "a", kind: "assertion_failure", framework: "jest", testName: "expires at 2026-08-23T18:00:00Z", message: "Error at /home/runner/work/repo/src/token.ts:12:4 request-id: abc123", file: "src/token.ts", rawStart: 1, rawEnd: 1, score: 0, evidenceReasons: [] };
    const changed = { ...base, id: "b", testName: "expires at 2026-08-24T19:22:01Z", message: "Error at /Users/me/project/src/token.ts:77:9 request-id: def456" };
    expect(fingerprintEvent(base)).toBe(fingerprintEvent(changed));
  });

  it("changes a fingerprint for a materially different assertion", () => {
    const base: FailureEvent = { id: "a", kind: "assertion_failure", framework: "jest", message: "Expected 401 Received 200", rawStart: 1, rawEnd: 1, score: 0, evidenceReasons: [] };
    expect(fingerprintEvent(base)).not.toBe(fingerprintEvent({ ...base, message: "Expected 403 Received 500" }));
  });

  it("enforces the configured estimated-token budget", () => {
    const result = analyze({ logs: `${jestLog}\n${"detail ".repeat(20_000)}`, diff, runId: "budget", tokenBudget: 650 });
    expect(result.report.compression.packetEstimatedTokens).toBeLessThanOrEqual(650);
  });

  it("redacts secrets from persisted records and context", () => {
    const secret = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const result = analyze({ logs: `fatal Error authorization=${secret}`, diff: "", runId: "secret", tokenBudget: 800 });
    expect(JSON.stringify(result.report)).not.toContain(secret);
    expect(result.context).not.toContain(secret);
    expect(result.context).toContain("[REDACTED:possible-secret]");
  });
});

describe("golden fixture", () => {
  it("selects the expected origin, citation, source relation, and compression math", async () => {
    const fixture = resolve("fixtures/noisy-jest-run");
    const [logs, fixtureDiff, expectedText] = await Promise.all([
      readFile(resolve(fixture, "ci.log"), "utf8"),
      readFile(resolve(fixture, "commit.diff"), "utf8"),
      readFile(resolve(fixture, "expected.json"), "utf8"),
    ]);
    const expected = JSON.parse(expectedText);
    const result = analyze({ logs, diff: fixtureDiff, runId: "demo-run-001", tokenBudget: 2000 });
    expect(result.report.fingerprint).toBe(expected.fingerprint);
    expect(result.report.classification).toBe(expected.classification);
    expect([result.report.primaryFailure.rawStart, result.report.primaryFailure.rawEnd]).toEqual(expected.evidenceRange);
    expect(result.report.relatedChanges[0].file).toBe(expected.relatedFile);
    expect(result.report.compression.packetEstimatedTokens).toBeLessThanOrEqual(2000);
    expect(result.report.compression.reductionPercent).toBe(Number(((1 - result.report.compression.packetEstimatedTokens / result.report.compression.rawEstimatedTokens) * 100).toFixed(2)));
  });
});
