import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { githubAppConfig } from "../src/github-app/config.js";
import { workflowJobId, type GitHubInstallationClient } from "../src/github-app/client.js";
import { processGitHubEvent, type GitHubAppServices } from "../src/github-app/process-event.js";
import { verifyWebhookSignature } from "../src/github-app/signature.js";
import { runArchivePrefix, storeRunArchive, type BlobWriter } from "../src/storage/blob-run-store.js";
import { analyze } from "../src/analysis/analyze.js";

const config = {
  appId: "123",
  privateKey: "unused-in-injected-tests",
  webhookSecret: "webhook-secret",
  publicUrl: "https://ci-signal.vercel.app",
};

describe("GitHub App integration", () => {
  it("verifies GitHub webhook signatures in constant-shape form", () => {
    const body = JSON.stringify({ zen: "Keep it logically awesome." });
    const signature = `sha256=${createHmac("sha256", config.webhookSecret).update(body).digest("hex")}`;
    expect(verifyWebhookSignature(config.webhookSecret, body, signature)).toBe(true);
    expect(verifyWebhookSignature(config.webhookSecret, `${body}x`, signature)).toBe(false);
    expect(verifyWebhookSignature(config.webhookSecret, body, null)).toBe(false);
  });

  it("loads secrets from environment without leaking escaped private-key newlines", () => {
    const loaded = githubAppConfig({
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "line-one\\nline-two",
      GITHUB_WEBHOOK_SECRET: "secret",
      CISIGNAL_PUBLIC_URL: "https://example.test/",
    });
    expect(loaded.privateKey).toBe("line-one\nline-two");
    expect(loaded.publicUrl).toBe("https://example.test");
  });

  it("derives a GitHub Actions job id only from a job details URL", () => {
    expect(workflowJobId("https://github.com/acme/repo/actions/runs/9/job/12345")).toBe(12345);
    expect(workflowJobId("https://example.test/check/12345")).toBeUndefined();
  });

  it("archives a redacted, deterministic failure bundle", async () => {
    const writes: Array<{ pathname: string; body: string; contentType: string }> = [];
    const writer: BlobWriter = {
      async write(pathname, body, contentType) {
        writes.push({ pathname, body, contentType });
        return { pathname, url: `https://private.example/${pathname}`, size: Buffer.byteLength(body) };
      },
    };
    const result = analyze({ logs: "fatal Error: demo failed", diff: "", runId: "archive-test", tokenBudget: 900 });
    const secret = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const archive = await storeRunArchive({
      installationId: 7,
      repository: "Dannyso05/CISignal",
      headSha: "ABC123",
      sourceCheckId: 99,
      sourceCheckName: "Verify",
      rawLog: `fatal Error token=${secret}`,
      report: result.report,
      context: result.context,
      summary: result.summary,
      writer,
    });
    expect(archive.prefix).toBe("cisignal/7/dannyso05/cisignal/abc123/99");
    expect(writes).toHaveLength(5);
    expect(writes.find((write) => write.pathname.endsWith("failure.log"))?.body).toContain("[REDACTED:possible-secret]");
    expect(JSON.stringify(writes)).not.toContain(secret);
  });

  it("normalizes archive path segments", () => {
    expect(runArchivePrefix({ installationId: 4, repository: "A C/Repo Name", headSha: "ABC/123", sourceCheckId: 8 }))
      .toBe("cisignal/4/a-c/repo-name/abc-123/8");
  });

  it("queues a branded check when a pull request is opened", async () => {
    const created: unknown[] = [];
    const fakeClient = {
      checkRuns: async () => [],
      createCheckRun: async (_repository: string, _headSha: string, update: unknown) => { created.push(update); return { id: 44 }; },
    } as unknown as GitHubInstallationClient;
    const services: GitHubAppServices = {
      installationToken: async () => "installation-token",
      client: () => fakeClient,
      archive: async () => { throw new Error("archive should not run for a queued check"); },
    };
    const result = await processGitHubEvent("pull_request", {
      action: "opened",
      installation: { id: 7 },
      repository: { full_name: "Dannyso05/CISignal" },
      pull_request: { number: 1, head: { sha: "abc123" } },
    }, config, services);
    expect(result).toEqual({ handled: true, outcome: "queued" });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ name: "CISignal", status: "queued", external_id: "cisignal:pr:1:abc123" });
  });
});
