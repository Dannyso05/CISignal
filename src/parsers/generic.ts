import type { FailureEvent, FailureKind, NormalizedLine } from "../types.js";
import type { FailureParser } from "./parser.js";
import { eventId } from "./parser.js";

const GENERIC = /\b(error|exception|traceback|panic|fatal|timed?\s*out|timeout|cannot find module|network|registry|exit(?:ed)?(?: with)? code\s*\d+)\b/i;

function classify(value: string): FailureKind {
  if (/exit(?:ed)?(?: with)? code/i.test(value)) return "process_exit";
  if (/timed?\s*out|timeout/i.test(value)) return "timeout";
  if (/network|registry|cannot find module|dependency/i.test(value)) return "dependency_error";
  return "unknown_error";
}

export class GenericParser implements FailureParser {
  name = "generic";

  parse(lines: NormalizedLine[]): FailureEvent[] {
    return lines.flatMap((line) => {
      if (!GENERIC.test(line.normalized)) return [];
      return [{
        id: eventId("generic", line.index),
        kind: classify(line.normalized),
        framework: "generic" as const,
        message: line.normalized.trim().slice(0, 500),
        rawStart: line.index,
        rawEnd: line.index,
        score: 0,
        evidenceReasons: [],
      }];
    });
  }
}
