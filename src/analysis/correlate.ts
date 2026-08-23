import type { ChangedFile, FailureEvent, FailureRecord } from "../types.js";

function cleanPath(path = ""): string {
  return path.replace(/^\.\//, "").replace(/^<workspace>\//, "");
}

function basename(path: string): string {
  return cleanPath(path).split("/").pop()?.replace(/\.(?:test|spec)(?=\.)/, "") ?? "";
}

export function correlationForEvent(event: FailureEvent, changedFiles: ChangedFile[]): FailureRecord["relatedChanges"] {
  return changedFiles
    .map((changed) => {
      const reasons: string[] = [];
      let score = 0;
      const eventFile = cleanPath(event.file);
      const changedPath = cleanPath(changed.path);

      if (eventFile && eventFile === changedPath) {
        score += 10;
        reasons.push("failure location is directly changed");
      }
      if (event.stackFiles?.some((file) => cleanPath(file) === changedPath)) {
        score += 8;
        reasons.push("failure stack references this changed file");
      }
      const eventBase = basename(eventFile);
      const changedBase = basename(changedPath);
      if (eventBase && changedBase && (eventBase.includes(changedBase) || changedBase.includes(eventBase))) {
        score += 6;
        reasons.push("source and test basenames are related");
      }
      if (event.testName?.toLowerCase().includes("token") && changedPath.toLowerCase().includes("token")) {
        score += 5;
        reasons.push("changed path matches the failing token behavior");
      }
      if (event.kind === "dependency_error" && changed.kind === "dependency") {
        score += 5;
        reasons.push("dependency failure aligns with a manifest or lockfile change");
      }
      if ((event.kind === "typecheck_error" || event.kind === "compiler_error") && changed.kind === "config") {
        score += 2;
        reasons.push("compiler failure may relate to changed configuration");
      }
      return { file: changed.path, score, reasons };
    })
    .filter((relation) => relation.score > 0)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
}
