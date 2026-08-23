import type { FailureEvent } from "../types.js";

export function detectCascades(primary: FailureEvent, events: FailureEvent[]): FailureEvent[] {
  return events.map((event) => {
    if (event.id === primary.id) return event;
    const afterPrimary = event.rawStart > primary.rawStart;
    const genericExit = event.kind === "process_exit";
    const repeatedMessage = event.message.toLowerCase() === primary.message.toLowerCase();
    const sharedStack = Boolean(event.stackFiles?.some((file) => primary.stackFiles?.includes(file)));
    const fixtureCascade = afterPrimary && /fixture|setup|beforeeach|auth context/i.test(`${event.testName ?? ""} ${event.message}`);
    if (afterPrimary && (genericExit || repeatedMessage || sharedStack || fixtureCascade)) {
      return {
        ...event,
        cascadeOf: primary.id,
        evidenceReasons: [...event.evidenceReasons, "classified as a conservative downstream/cascade candidate"],
      };
    }
    return event;
  });
}
