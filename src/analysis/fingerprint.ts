import { createHash } from "node:crypto";
import type { FailureEvent } from "../types.js";

export function normalizeFingerprintPart(value = ""): string {
  return value
    .toLowerCase()
    .replace(/\b\d{4}-\d{2}-\d{2}[t ][\d:.+-]+z?\b/g, "<timestamp>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "<uuid>")
    .replace(/\b(?:request|trace|run)[-_ ]?id[:= ]+[\w-]+\b/gi, "$1-id:<id>")
    .replace(/0x[0-9a-f]+/gi, "<address>")
    .replace(/:\d+(?::\d+)?\b/g, ":<line>")
    .replace(/(?:\/[\w.@-]+){3,}\//g, "<workspace>/")
    .replace(/\b\d{6,}\b/g, "<number>")
    .replace(/\s+/g, " ")
    .trim();
}

export function fingerprintCanonical(event: FailureEvent): string {
  return [
    event.framework ?? "unknown",
    event.kind,
    normalizeFingerprintPart(event.testName),
    normalizeFingerprintPart(event.message),
    normalizeFingerprintPart(event.file),
  ].join(" | ");
}

export function fingerprintEvent(event: FailureEvent): string {
  return createHash("sha256").update(fingerprintCanonical(event)).digest("hex");
}
