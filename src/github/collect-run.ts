import type { AnalyzeInput } from "../types.js";

interface GitHubJob {
  id: number;
  name: string;
  conclusion: string | null;
}

interface GitHubJobsResponse {
  jobs: GitHubJob[];
}

export interface GitHubRunInput {
  repository: string;
  runId: string;
  baseSha: string;
  headSha: string;
  tokenBudget: number;
  token?: string;
}

async function githubFetch(url: string, token: string, accept = "application/vnd.github+json"): Promise<Response> {
  const response = await fetch(`https://api.github.com${url}`, {
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CISignal/0.1",
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${url}: ${await response.text()}`);
  return response;
}

export async function collectGitHubRun(input: GitHubRunInput): Promise<AnalyzeInput> {
  const token = input.token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GitHub analysis requires GH_TOKEN or GITHUB_TOKEN with actions:read and contents:read");
  if (!/^[\w.-]+\/[\w.-]+$/.test(input.repository)) throw new Error("Repository must use owner/name format");
  const jobs = await githubFetch(`/repos/${input.repository}/actions/runs/${input.runId}/jobs?per_page=100`, token).then((response) => response.json() as Promise<GitHubJobsResponse>);
  const failed = jobs.jobs.filter((job) => job.conclusion === "failure" || job.conclusion === "timed_out");
  if (!failed.length) throw new Error(`No completed failed or timed-out jobs were available for run ${input.runId}`);

  const logParts: string[] = [];
  for (const job of failed) {
    try {
      const log = await githubFetch(`/repos/${input.repository}/actions/jobs/${job.id}/logs`, token, "application/vnd.github+json").then((response) => response.text());
      logParts.push(`[CISignal job: ${job.name}]\n${log}`);
    } catch (error) {
      logParts.push(`[CISignal job: ${job.name}]\nError: logs unavailable — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const diff = await githubFetch(`/repos/${input.repository}/compare/${input.baseSha}...${input.headSha}`, token, "application/vnd.github.v3.diff").then((response) => response.text());
  return {
    logs: logParts.join("\n\n"),
    diff,
    runId: input.runId,
    repository: input.repository,
    baseSha: input.baseSha,
    headSha: input.headSha,
    tokenBudget: input.tokenBudget,
  };
}
