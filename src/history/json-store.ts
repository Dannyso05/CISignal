import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FailureRecord } from "../types.js";
import type { FailureStore } from "./store.js";
import { validateFailureRecord } from "../reports/json.js";

export class JsonFailureStore implements FailureStore {
  constructor(private readonly directory: string) {}

  async put(record: FailureRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const safeRunId = record.runId.replace(/[^a-zA-Z0-9._-]/g, "_");
    const target = join(this.directory, `${safeRunId}.json`);
    const temporary = `${target}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }

  async list(filter: { repository?: string; since?: string } = {}): Promise<FailureRecord[]> {
    let entries: string[] = [];
    try {
      entries = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const records = await Promise.all(entries.filter((entry) => entry.endsWith(".json")).sort().map(async (entry) => {
      const parsed: unknown = JSON.parse(await readFile(join(this.directory, entry), "utf8"));
      if (!validateFailureRecord(parsed)) throw new Error(`Invalid failure record: ${entry}`);
      return parsed;
    }));
    return records.filter((record) => {
      if (filter.repository && record.repository !== filter.repository) return false;
      if (filter.since && record.startedAt && record.startedAt < filter.since) return false;
      return true;
    });
  }

  async findByFingerprint(fingerprint: string): Promise<FailureRecord[]> {
    return (await this.list()).filter((record) => record.fingerprint === fingerprint);
  }
}
