import type { FailureEvent, NormalizedLine } from "../types.js";
import type { FailureParser } from "./parser.js";
import { eventId } from "./parser.js";

const TS_ERROR = /^\s*(.+?\.(?:ts|tsx))(?:(?:\((\d+),(\d+)\))|(?::(\d+):(\d+)))\s*[-:]?\s*error\s+(TS\d+):\s*(.+)$/i;

export class TypeScriptParser implements FailureParser {
  name = "typescript";

  parse(lines: NormalizedLine[]): FailureEvent[] {
    return lines.flatMap((line) => {
      const match = line.normalized.match(TS_ERROR);
      if (!match) return [];
      return [{
        id: eventId("typescript", line.index),
        kind: "typecheck_error" as const,
        framework: "typescript" as const,
        message: `${match[6]}: ${match[7]}`,
        file: match[1],
        sourceLine: Number(match[2] ?? match[4]),
        rawStart: line.index,
        rawEnd: line.index,
        score: 0,
        evidenceReasons: [],
      }];
    });
  }
}
