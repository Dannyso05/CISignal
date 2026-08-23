export type CheckStatus = "queued" | "in_progress" | "completed";
export type CheckConclusion = "success" | "neutral" | "failure" | "cancelled" | "timed_out" | "action_required";

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "notice" | "warning" | "failure";
  message: string;
  title?: string;
}

export interface CheckRun {
  id: number;
  name: string;
  external_id?: string;
  app?: { id?: number };
}

interface CheckOutput {
  title: string;
  summary: string;
  text?: string;
  annotations?: CheckAnnotation[];
}

export interface CheckUpdate {
  name?: string;
  status: CheckStatus;
  conclusion?: CheckConclusion;
  completed_at?: string;
  details_url?: string;
  external_id?: string;
  output: CheckOutput;
}

export interface IssueComment {
  id: number;
  body?: string;
  user?: { id?: number; login?: string };
  performed_via_github_app?: { id?: number } | null;
}

export class GitHubInstallationClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown, accept = "application/vnd.github+json"): Promise<T> {
    const response = await this.fetcher(`https://api.github.com${path}`, {
      method,
      redirect: "follow",
      headers: {
        Accept: accept,
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "CISignal-GitHub-App/0.1",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    if (accept.includes("diff") || accept.startsWith("text/")) return await response.text() as T;
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }

  async pullRequestDiff(repository: string, pullRequest: number): Promise<string> {
    return this.request<string>("GET", `/repos/${repository}/pulls/${pullRequest}`, undefined, "application/vnd.github.v3.diff");
  }

  async workflowJobLog(repository: string, jobId: number): Promise<string> {
    return this.request<string>("GET", `/repos/${repository}/actions/jobs/${jobId}/logs`, undefined, "text/plain");
  }

  async checkRuns(repository: string, headSha: string, name: string): Promise<CheckRun[]> {
    const value = await this.request<{ check_runs?: CheckRun[] }>("GET", `/repos/${repository}/commits/${headSha}/check-runs?check_name=${encodeURIComponent(name)}&filter=latest&per_page=100`);
    return value.check_runs ?? [];
  }

  async createCheckRun(repository: string, headSha: string, update: CheckUpdate): Promise<CheckRun> {
    return this.request<CheckRun>("POST", `/repos/${repository}/check-runs`, { head_sha: headSha, ...update });
  }

  async updateCheckRun(repository: string, checkRunId: number, update: CheckUpdate): Promise<CheckRun> {
    return this.request<CheckRun>("PATCH", `/repos/${repository}/check-runs/${checkRunId}`, update);
  }

  async issueComments(repository: string, pullRequest: number): Promise<IssueComment[]> {
    return this.request<IssueComment[]>("GET", `/repos/${repository}/issues/${pullRequest}/comments?per_page=100`);
  }

  async createIssueComment(repository: string, pullRequest: number, body: string): Promise<IssueComment> {
    return this.request<IssueComment>("POST", `/repos/${repository}/issues/${pullRequest}/comments`, { body });
  }

  async updateIssueComment(repository: string, commentId: number, body: string): Promise<IssueComment> {
    return this.request<IssueComment>("PATCH", `/repos/${repository}/issues/comments/${commentId}`, { body });
  }
}

export function workflowJobId(detailsUrl?: string): number | undefined {
  const value = detailsUrl?.match(/\/job\/(\d+)/)?.[1];
  return value ? Number(value) : undefined;
}
