import { put } from "@vercel/blob";
import { redactSecrets } from "../normalize/redact.js";
import type { FailureRecord } from "../types.js";

export interface StoredBlob {
  pathname: string;
  url: string;
  size?: number;
}

export interface RunArchive {
  prefix: string;
  rawLog: StoredBlob;
  report: StoredBlob;
  context: StoredBlob;
  summary: StoredBlob;
  manifest: StoredBlob;
}

export interface BlobWriter {
  write(pathname: string, body: string, contentType: string): Promise<StoredBlob>;
}

function segment(value: string | number): string {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

export function runArchivePrefix(input: {
  installationId: number;
  repository: string;
  headSha: string;
  sourceCheckId: number;
}): string {
  const [owner = "unknown", repository = "unknown"] = input.repository.split("/");
  return ["cisignal", segment(input.installationId), segment(owner), segment(repository), segment(input.headSha), segment(input.sourceCheckId)].join("/");
}

function vercelBlobWriter(token: string): BlobWriter {
  return {
    async write(pathname, body, contentType) {
      const result = await put(pathname, body, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType,
        token,
      });
      return { pathname: result.pathname, url: result.url, size: Buffer.byteLength(body) };
    },
  };
}

export async function storeRunArchive(input: {
  installationId: number;
  repository: string;
  headSha: string;
  sourceCheckId: number;
  sourceCheckName: string;
  rawLog: string;
  report: FailureRecord;
  context: string;
  summary: string;
  token?: string;
  writer?: BlobWriter;
}): Promise<RunArchive> {
  const writer = input.writer ?? (input.token ? vercelBlobWriter(input.token) : undefined);
  if (!writer) throw new Error("A Vercel Blob token or BlobWriter is required to archive a run");
  const prefix = runArchivePrefix(input);
  const redactedLog = redactSecrets(input.rawLog);
  const [rawLog, report, context, summary] = await Promise.all([
    writer.write(`${prefix}/failure.log`, redactedLog, "text/plain; charset=utf-8"),
    writer.write(`${prefix}/report.json`, `${JSON.stringify(input.report, null, 2)}\n`, "application/json; charset=utf-8"),
    writer.write(`${prefix}/context.md`, `${input.context}\n`, "text/markdown; charset=utf-8"),
    writer.write(`${prefix}/summary.md`, input.summary, "text/markdown; charset=utf-8"),
  ]);
  const manifestBody = `${JSON.stringify({
    schemaVersion: "0.1",
    archivedAt: new Date().toISOString(),
    repository: input.repository,
    headSha: input.headSha,
    sourceCheckId: input.sourceCheckId,
    sourceCheckName: input.sourceCheckName,
    redacted: true,
    files: { rawLog, report, context, summary },
  }, null, 2)}\n`;
  const manifest = await writer.write(`${prefix}/manifest.json`, manifestBody, "application/json; charset=utf-8");
  return { prefix, rawLog, report, context, summary, manifest };
}
