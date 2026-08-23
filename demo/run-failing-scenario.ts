import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const scenarioIndex = process.argv.indexOf("--scenario");
const scenario = scenarioIndex >= 0 ? process.argv[scenarioIndex + 1] : "expired-token";

async function main(): Promise<void> {
  if (scenario === "typescript-error") {
    process.stdout.write("src/config.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.\nError: Process completed with exit code 1\n");
  } else if (scenario === "fixture-cascade") {
    process.stdout.write("FAIL tests/auth/fixture.test.ts\n  ● shared auth fixture › initializes context\n    Error: setup fixture could not create authenticated context\n    at createAuthContext (tests/auth/fixture.ts:71:9)\n  ● shared auth fixture › dependent test one\n    Error: setup fixture unavailable\nError: Process completed with exit code 1\n");
  } else if (scenario === "expired-token") {
    process.stdout.write(await readFile(resolve(import.meta.dirname, "../fixtures/noisy-jest-run/ci.log"), "utf8"));
  } else {
    throw new Error(`Unknown scenario: ${scenario}`);
  }
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
