import type { FailureEvent, NormalizedLine } from "../types.js";
import type { FailureParser } from "./parser.js";
import { eventId } from "./parser.js";

const FAILED_TEST = /^\s*FAILED\s+(.+?\.py)::(.+?)(?:\s+-\s+(.+))?\s*$/;
const PYTHON_LOCATION = /^\s*([^:\s]+\.py):(\d+):\s*(.*)$/;
const FAILURE_HEADER = /^_+\s+.+\s+_+$/;

export class PytestParser implements FailureParser {
  name = "pytest";

  parse(lines: NormalizedLine[]): FailureEvent[] {
    const events: FailureEvent[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const summary = lines[index].normalized.match(FAILED_TEST);
      if (!summary) continue;

      const file = summary[1].trim();
      const testName = summary[2].trim();
      const testLeaf = testName.split("::").at(-1)?.replace(/\[.*\]$/, "") ?? testName;
      let detailStart = -1;
      for (let cursor = index - 1; cursor >= Math.max(0, index - 250); cursor -= 1) {
        if (FAILURE_HEADER.test(lines[cursor].normalized) && lines[cursor].normalized.includes(testLeaf)) {
          detailStart = cursor;
          break;
        }
      }
      let detailEnd = detailStart;
      if (detailStart >= 0) {
        for (let cursor = detailStart + 1; cursor < index; cursor += 1) {
          if (FAILURE_HEADER.test(lines[cursor].normalized) || /^=+\s+short test summary info\s+=+$/i.test(lines[cursor].normalized)) break;
          detailEnd = cursor;
        }
      }
      const block = detailStart >= 0 ? lines.slice(detailStart, detailEnd + 1) : [lines[index]];
      const locations = block.flatMap((entry) => {
        const match = entry.normalized.match(PYTHON_LOCATION);
        return match ? [{ file: match[1], line: Number(match[2]), detail: match[3] }] : [];
      });
      const source = [...locations].reverse().find((entry) => entry.file === file) ?? locations.at(-1);
      const assertion = [...block].reverse().find((entry) => /^\s*(?:E\s+|>\s*assert\b)/.test(entry.normalized));
      const assertionText = assertion?.normalized.replace(/^\s*(?:E\s+|>\s*)/, "").trim();
      const message = summary[3]?.trim() || assertionText || source?.detail || testName;
      const isAssertion = /\bassert(?:ionerror)?\b/i.test(`${message} ${block.map((entry) => entry.normalized).join(" ")}`);

      events.push({
        id: eventId("pytest", lines[index].index),
        kind: isAssertion ? "assertion_failure" : "test_failure",
        framework: "pytest",
        testName,
        message,
        file,
        sourceLine: source?.line,
        rawStart: block[0]?.index ?? lines[index].index,
        rawEnd: block.at(-1)?.index ?? lines[index].index,
        score: 0,
        evidenceReasons: [],
        stackFiles: [...new Set(locations.map((entry) => entry.file))],
      });
    }

    return events;
  }
}
