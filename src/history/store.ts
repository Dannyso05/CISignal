import type { FailureRecord } from "../types.js";

export interface FailureStore {
  put(record: FailureRecord): Promise<void>;
  list(filter?: { repository?: string; since?: string }): Promise<FailureRecord[]>;
  findByFingerprint(fingerprint: string): Promise<FailureRecord[]>;
}
