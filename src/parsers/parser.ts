import type { FailureEvent, NormalizedLine } from "../types.js";

export interface FailureParser {
  name: string;
  parse(lines: NormalizedLine[]): FailureEvent[];
}

export function eventId(framework: string, start: number, suffix = ""): string {
  return `${framework}-${start}${suffix ? `-${suffix}` : ""}`;
}
