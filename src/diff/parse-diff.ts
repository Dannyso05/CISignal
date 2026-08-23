import type { ChangedFile } from "../types.js";

function classifyPath(path: string): ChangedFile["kind"] {
  if (/(^|\/)(?:test|tests|__tests__|spec)(\/|\.)|\.(?:test|spec)\.[jt]sx?$/.test(path)) return "test";
  if (/(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path)) return "dependency";
  if (/(^|\/)(?:\.github|config)(\/|$)|\.(?:ya?ml|json|toml)$/.test(path)) return "config";
  if (/\.(?:[cm]?[jt]sx?|py|go|rs|java|rb)$/.test(path)) return "source";
  return "unknown";
}

export function parseDiff(diff: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  let current: ChangedFile | undefined;
  let hunk: string[] = [];

  const flushHunk = () => {
    if (current && hunk.length) current.hunks?.push(hunk.join("\n"));
    hunk = [];
  };

  for (const line of diff.split(/\r?\n/)) {
    const fileMatch = line.match(/^\+\+\+\s+b\/(.+)$/);
    if (fileMatch) {
      flushHunk();
      current = {
        path: fileMatch[1],
        kind: classifyPath(fileMatch[1]),
        changedRanges: [],
        hunks: [],
      };
      files.push(current);
      continue;
    }
    const hunkMatch = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (hunkMatch && current) {
      flushHunk();
      const start = Number(hunkMatch[1]);
      const count = Number(hunkMatch[2] ?? 1);
      current.changedRanges.push([start, Math.max(start, start + count - 1)]);
      hunk.push(line);
      continue;
    }
    if (hunk.length) hunk.push(line);
  }
  flushHunk();
  return files;
}
