import { stripAnsi } from "./ansi.js";
import type { NormalizedLine } from "../types.js";

const TIMESTAMP = /^(?:\[)?(\d{4}-\d{2}-\d{2}[T ][0-9:.+-]+Z?)(?:\])?\s*/;
const ABSOLUTE_PATH = /\/(?:[\w.@-]+\/){2,}(?=[\w.@-])/g;
const PROJECT_ANCHORS = new Set(["src", "test", "tests", "packages", "apps", "lib", "dashboard", "fixtures"]);

function normalizeAbsolutePathPrefix(prefix: string): string {
  const segments = prefix.split("/").filter(Boolean);
  let anchorIndex = -1;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (PROJECT_ANCHORS.has(segments[index])) {
      anchorIndex = index;
      break;
    }
  }
  return anchorIndex >= 0 ? `<workspace>/${segments.slice(anchorIndex).join("/")}/` : "<workspace>/";
}

export function normalizeLog(log: string): NormalizedLine[] {
  const rawLines = log.replace(/\r(?!\n)/g, "\n").split(/\r?\n/);
  const seen = new Map<string, number>();

  return rawLines.map((raw, offset) => {
    const ansiFree = stripAnsi(raw);
    const timestampMatch = ansiFree.match(TIMESTAMP);
    const normalized = ansiFree
      .replace(TIMESTAMP, "")
      .replace(ABSOLUTE_PATH, normalizeAbsolutePathPrefix)
      .replace(/\s+$/g, "");
    const canonical = normalized.trim();
    const duplicateOf = canonical && seen.has(canonical) ? seen.get(canonical) : undefined;
    if (canonical && duplicateOf === undefined) seen.set(canonical, offset + 1);

    return {
      index: offset + 1,
      raw,
      normalized,
      timestamp: timestampMatch?.[1],
      duplicateOf,
    };
  });
}
