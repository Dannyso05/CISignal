import type { FailureEvent, NormalizedLine } from "../types.js";
import type { FailureParser } from "./parser.js";
import { eventId } from "./parser.js";

const FAIL_FILE = /^\s*FAIL\s+([^\s]+\.(?:[cm]?[jt]sx?))(?:\s+.*)?$/;
const TEST_NAME = /^\s*[●✕×]\s+(.+)$/;
const STACK = /\bat\s+(?:.+?\s+\()?([^()\s]+\.(?:[cm]?[jt]sx?)):(\d+):(\d+)\)?/;
const VITEST_STACK = /^\s*❯\s+([^:\s]+\.(?:[cm]?[jt]sx?)):(\d+):(\d+)/;

export class JestParser implements FailureParser {
  name = "jest";

  parse(lines: NormalizedLine[]): FailureEvent[] {
    const events: FailureEvent[] = [];
    let failedFile: string | undefined;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const failMatch = line.normalized.match(FAIL_FILE);
      if (failMatch) {
        failedFile = failMatch[1].trim();
        continue;
      }

      const testMatch = line.normalized.match(TEST_NAME);
      if (!testMatch) continue;

      const block: NormalizedLine[] = [line];
      let end = index;
      for (let cursor = index + 1; cursor < Math.min(lines.length, index + 28); cursor += 1) {
        if (cursor > index + 1 && TEST_NAME.test(lines[cursor].normalized)) break;
        if (/^\s*(Test Files|Tests:|Test Suites:)/.test(lines[cursor].normalized)) break;
        block.push(lines[cursor]);
        end = cursor;
      }

      const expected = block.find((entry) => /^\s*Expected:/.test(entry.normalized));
      const received = block.find((entry) => /^\s*Received:/.test(entry.normalized));
      const stack = block.map((entry) => entry.normalized.match(STACK) ?? entry.normalized.match(VITEST_STACK)).find(Boolean);
      const failure = block.map((entry) => entry.normalized.match(FAIL_FILE)).find(Boolean);
      const vitestTestName = block
        .map((entry) => entry.normalized.match(/^\s*FAIL\s+[^\s]+\.(?:[cm]?[jt]sx?)\s+>\s+(.+)$/))
        .find(Boolean)?.[1]
        .replaceAll(" > ", " › ");
      const assertionLine = block.find((entry) => /expect\(|Expected:|Received:|AssertionError/i.test(entry.normalized));
      const message = [assertionLine?.normalized.trim(), expected?.normalized.trim(), received?.normalized.trim()]
        .filter(Boolean)
        .filter((value, valueIndex, values) => values.indexOf(value) === valueIndex)
        .join(" ") || testMatch[1].trim();
      const file = stack?.[1] ?? failure?.[1] ?? failedFile;

      events.push({
        id: eventId("jest", line.index),
        kind: expected || received || assertionLine ? "assertion_failure" : "test_failure",
        framework: "jest",
        testName: vitestTestName ?? testMatch[1].trim(),
        message,
        file,
        sourceLine: stack ? Number(stack[2]) : undefined,
        rawStart: line.index,
        rawEnd: block[block.length - 1]?.index ?? line.index,
        score: 0,
        evidenceReasons: [],
        stackFiles: block.flatMap((entry) => {
          const match = entry.normalized.match(STACK);
          return match ? [match[1]] : [];
        }),
      });
      index = end;
    }

    return events;
  }
}
