import { analyze } from "../analysis/analyze.js";
import { renderPullRequestComment } from "../reports/pr-comment.js";
import { storeRunArchive, type RunArchive } from "../storage/blob-run-store.js";
import type { GitHubAppConfig } from "./config.js";
import { createInstallationToken } from "./auth.js";
import { GitHubInstallationClient, workflowJobId, type CheckAnnotation, type CheckUpdate } from "./client.js";

const APP_COMMENT_MARKER = "<!-- cisignal-github-app -->";
const FAILURE_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "action_required"]);

interface PullRequestReference {
  number: number;
  head?: { sha?: string };
}

interface BasePayload {
  action?: string;
  installation?: { id?: number };
  repository?: { full_name?: string };
}

interface PullRequestPayload extends BasePayload {
  pull_request?: PullRequestReference;
}

interface CheckRunPayload extends BasePayload {
  check_run?: {
    id?: number;
    name?: string;
    conclusion?: string | null;
    head_sha?: string;
    details_url?: string;
    app?: { id?: number };
    pull_requests?: PullRequestReference[];
  };
}

interface CheckSuitePayload extends BasePayload {
  check_suite?: {
    conclusion?: string | null;
    head_sha?: string;
    app?: { id?: number };
    pull_requests?: PullRequestReference[];
  };
}

export interface ProcessResult {
  handled: boolean;
  outcome: string;
  archivePrefix?: string;
}

export interface GitHubAppServices {
  installationToken(config: GitHubAppConfig, installationId: number): Promise<string>;
  client(token: string): GitHubInstallationClient;
  archive(input: Parameters<typeof storeRunArchive>[0]): Promise<RunArchive>;
}

const defaultServices: GitHubAppServices = {
  installationToken: (config, installationId) => createInstallationToken({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId,
  }),
  client: (token) => new GitHubInstallationClient(token),
  archive: storeRunArchive,
};

function requiredContext(payload: BasePayload): { installationId: number; repository: string } {
  const installationId = payload.installation?.id;
  const repository = payload.repository?.full_name;
  if (!installationId || !repository) throw new Error("Webhook payload is missing installation or repository context");
  return { installationId, repository };
}

function externalId(pullRequest: number, headSha: string): string {
  return `cisignal:pr:${pullRequest}:${headSha}`;
}

async function upsertCheck(input: {
  client: GitHubInstallationClient;
  config: GitHubAppConfig;
  repository: string;
  pullRequest: number;
  headSha: string;
  update: CheckUpdate;
}): Promise<number> {
  const marker = externalId(input.pullRequest, input.headSha);
  const runs = await input.client.checkRuns(input.repository, input.headSha, "CISignal");
  const existing = runs.find((run) => run.external_id === marker && run.app?.id === Number(input.config.appId));
  const update = { ...input.update, name: "CISignal", external_id: marker, details_url: input.config.publicUrl };
  if (existing) {
    await input.client.updateCheckRun(input.repository, existing.id, update);
    return existing.id;
  }
  return (await input.client.createCheckRun(input.repository, input.headSha, update)).id;
}

function primaryAnnotation(report: ReturnType<typeof analyze>["report"]): CheckAnnotation[] | undefined {
  const failure = report.primaryFailure;
  if (!failure.file || !failure.sourceLine) return undefined;
  return [{
    path: failure.file,
    start_line: failure.sourceLine,
    end_line: failure.sourceLine,
    annotation_level: "failure",
    title: failure.testName ?? "Likely originating failure",
    message: `${failure.message}\n\nCISignal confidence: ${Math.round(report.confidence * 100)}% (heuristic, not probability).`,
  }];
}

async function upsertComment(input: {
  client: GitHubInstallationClient;
  config: GitHubAppConfig;
  repository: string;
  pullRequest: number;
  body: string;
}): Promise<void> {
  const body = `${APP_COMMENT_MARKER}\n${input.body.replace("<!-- signalci-pr-report -->\n", "")}`;
  const comments = await input.client.issueComments(input.repository, input.pullRequest);
  const existing = comments.find((comment) => comment.body?.includes(APP_COMMENT_MARKER)
    && comment.performed_via_github_app?.id === Number(input.config.appId));
  if (existing) await input.client.updateIssueComment(input.repository, existing.id, body);
  else await input.client.createIssueComment(input.repository, input.pullRequest, body);
}

async function processPullRequest(payload: PullRequestPayload, config: GitHubAppConfig, services: GitHubAppServices): Promise<ProcessResult> {
  if (!payload.action || !["opened", "reopened", "synchronize"].includes(payload.action)) return { handled: false, outcome: "ignored-pull-request-action" };
  const { installationId, repository } = requiredContext(payload);
  const pullRequest = payload.pull_request?.number;
  const headSha = payload.pull_request?.head?.sha;
  if (!pullRequest || !headSha) throw new Error("Pull request webhook is missing its number or head SHA");
  const token = await services.installationToken(config, installationId);
  const client = services.client(token);
  await upsertCheck({
    client,
    config,
    repository,
    pullRequest,
    headSha,
    update: {
      status: "queued",
      output: {
        title: "Waiting for CI results",
        summary: "CISignal is installed and will analyze the first failed CI check for this commit.",
      },
    },
  });
  return { handled: true, outcome: "queued" };
}

async function processSuccessfulSuite(payload: CheckSuitePayload, config: GitHubAppConfig, services: GitHubAppServices): Promise<ProcessResult> {
  const suite = payload.check_suite;
  if (payload.action !== "completed" || suite?.conclusion !== "success") return { handled: false, outcome: "ignored-check-suite" };
  if (suite.app?.id === Number(config.appId)) return { handled: false, outcome: "ignored-own-check-suite" };
  const pullRequest = suite.pull_requests?.[0]?.number;
  const headSha = suite.head_sha;
  if (!pullRequest || !headSha) return { handled: false, outcome: "check-suite-has-no-pull-request" };
  const { installationId, repository } = requiredContext(payload);
  const token = await services.installationToken(config, installationId);
  const client = services.client(token);
  await upsertCheck({
    client,
    config,
    repository,
    pullRequest,
    headSha,
    update: {
      status: "completed",
      conclusion: "success",
      completed_at: new Date().toISOString(),
      output: {
        title: "CI passed",
        summary: "No failed CI job was available for CISignal to analyze.",
      },
    },
  });
  return { handled: true, outcome: "success" };
}

async function processFailedCheck(payload: CheckRunPayload, config: GitHubAppConfig, services: GitHubAppServices): Promise<ProcessResult> {
  const source = payload.check_run;
  if (payload.action !== "completed" || !source?.conclusion || !FAILURE_CONCLUSIONS.has(source.conclusion)) return { handled: false, outcome: "ignored-check-run" };
  if (source.app?.id === Number(config.appId)) return { handled: false, outcome: "ignored-own-check-run" };
  const pullRequest = source.pull_requests?.[0]?.number;
  const headSha = source.head_sha;
  const sourceCheckId = source.id;
  const jobId = workflowJobId(source.details_url);
  if (!pullRequest || !headSha || !sourceCheckId) return { handled: false, outcome: "check-run-has-no-pull-request" };
  const { installationId, repository } = requiredContext(payload);
  const token = await services.installationToken(config, installationId);
  const client = services.client(token);
  const checkRunId = await upsertCheck({
    client,
    config,
    repository,
    pullRequest,
    headSha,
    update: {
      status: "in_progress",
      output: {
        title: `Analyzing ${source.name ?? "failed CI check"}`,
        summary: "CISignal is fetching the failed job log and correlating it with the pull-request diff.",
      },
    },
  });

  try {
    if (!jobId) throw new Error("The failed check did not link to a GitHub Actions job log");
    const [rawLog, diff] = await Promise.all([
      client.workflowJobLog(repository, jobId),
      client.pullRequestDiff(repository, pullRequest),
    ]);
    const result = analyze({
      logs: rawLog,
      diff,
      runId: `app-${sourceCheckId}`,
      repository,
      pullRequest,
      headSha,
      tokenBudget: 2_000,
    });
    const archive = config.blobToken ? await services.archive({
      installationId,
      repository,
      headSha,
      sourceCheckId,
      sourceCheckName: source.name ?? "failed CI check",
      rawLog,
      report: result.report,
      context: result.context,
      summary: result.summary,
      token: config.blobToken,
    }) : undefined;
    const summary = renderPullRequestComment(result.report);
    await client.updateCheckRun(repository, checkRunId, {
      name: "CISignal",
      status: "completed",
      conclusion: "neutral",
      completed_at: new Date().toISOString(),
      details_url: config.publicUrl,
      external_id: externalId(pullRequest, headSha),
      output: {
        title: result.report.primaryFailure.testName ?? "Likely originating failure found",
        summary,
        annotations: primaryAnnotation(result.report),
      },
    });
    await upsertComment({ client, config, repository, pullRequest, body: summary });
    return { handled: true, outcome: "failure-analyzed", archivePrefix: archive?.prefix };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.updateCheckRun(repository, checkRunId, {
      name: "CISignal",
      status: "completed",
      conclusion: "neutral",
      completed_at: new Date().toISOString(),
      details_url: config.publicUrl,
      external_id: externalId(pullRequest, headSha),
      output: {
        title: "Analysis needs attention",
        summary: `CISignal received the failed check but could not complete analysis. ${message.slice(0, 500)}`,
      },
    });
    return { handled: true, outcome: "analysis-error" };
  }
}

export async function processGitHubEvent(
  event: string,
  payloadValue: unknown,
  config: GitHubAppConfig,
  services: GitHubAppServices = defaultServices,
): Promise<ProcessResult> {
  const payload = payloadValue as BasePayload;
  if (event === "pull_request") return processPullRequest(payload as PullRequestPayload, config, services);
  if (event === "check_run") return processFailedCheck(payload as CheckRunPayload, config, services);
  if (event === "check_suite") return processSuccessfulSuite(payload as CheckSuitePayload, config, services);
  if (event === "ping") return { handled: true, outcome: "pong" };
  return { handled: false, outcome: `ignored-${event || "unknown"}` };
}
