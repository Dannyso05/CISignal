import { SCORE_WEIGHTS } from "../config.js";
import type { ChangedFile, FailureEvent } from "../types.js";

const clean = (path = "") => path.replace(/^\.\//, "").replace(/^<workspace>\//, "");

export function deduplicate(events: FailureEvent[]): FailureEvent[] {
  const seen = new Map<string, FailureEvent>();
  return events.map((event) => {
    const key = [event.kind, event.testName?.toLowerCase(), event.message.toLowerCase(), clean(event.file)].join("|");
    const original = seen.get(key);
    if (original) return { ...event, duplicateOf: original.id };
    seen.set(key, event);
    return event;
  });
}

export function scoreEvents(events: FailureEvent[], changedFiles: ChangedFile[]): FailureEvent[] {
  let firstSpecificSeen = false;
  const changed = new Set(changedFiles.map((file) => clean(file.path)));

  return events.map((event) => {
    let score = 0;
    const reasons: string[] = [];
    const add = (value: number, reason: string) => {
      score += value;
      reasons.push(`${value > 0 ? "+" : ""}${value} ${reason}`);
    };

    if (event.kind === "assertion_failure") add(SCORE_WEIGHTS.explicitAssertion, "explicit failed assertion");
    if (event.kind === "compiler_error" || event.kind === "typecheck_error") add(SCORE_WEIGHTS.compilerError, "compiler/typechecker error");
    if (event.kind !== "process_exit" && event.kind !== "unknown_error" && !firstSpecificSeen) {
      add(SCORE_WEIGHTS.firstSpecific, "first specific error in failed section");
      firstSpecificSeen = true;
    }
    if (event.file && changed.has(clean(event.file))) add(SCORE_WEIGHTS.exactChangedFile, "event references changed file");
    if (event.stackFiles?.some((file) => changed.has(clean(file)))) add(SCORE_WEIGHTS.stackChangedFile, "stack references changed file");
    if (event.duplicateOf) add(SCORE_WEIGHTS.duplicate, "normalized duplicate");
    if (event.kind === "process_exit") add(SCORE_WEIGHTS.genericExit, "generic nonzero exit");
    if (event.kind === "dependency_error" && /warn|retry|progress/i.test(event.message)) add(SCORE_WEIGHTS.dependencyNoise, "dependency-install noise");
    if (/^(?:error:\s*)?(?:command|process) failed\.?$/i.test(event.message)) add(SCORE_WEIGHTS.commandFailedOnly, "only says command failed");

    return { ...event, score, evidenceReasons: reasons };
  }).sort((a, b) => b.score - a.score || a.rawStart - b.rawStart);
}
