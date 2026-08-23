# Install CISignal in any GitHub repository

CISignal can analyze another repository without copying its TypeScript source, publishing a package, or granting access to complete raw logs outside GitHub Actions. The supported hackathon path is a reusable workflow that runs inside the target repository with its short-lived `GITHUB_TOKEN`.

## Five-minute installation

1. Copy [`examples/github-actions/cisignal.yml`](../examples/github-actions/cisignal.yml) to `.github/workflows/cisignal.yml` in the target repository.
2. Replace `CI` in `workflows: ["CI"]` with the exact `name:` of the workflow to watch.
3. Commit the workflow to the repository's default branch. GitHub requires a `workflow_run` workflow to exist on the default branch before it can trigger.
4. Open a pull request that makes the watched CI workflow fail.
5. Open the resulting **CISignal / Analyze failed CI run** check. Its summary identifies the likely origin; its artifact contains `report.json`, `context.md`, and `summary.md`. For pull-request runs, CISignal also creates or updates one cited PR comment.

That is the entire recurring workflow. After the caller exists on the default branch, developers push and open pull requests normally; CISignal observes completed failures automatically. There is no manual report upload, no CISignal-owned test job, and no need to trigger the analyzer by hand.

No repository secrets are required. The caller grants only:

- `actions: read` to retrieve completed failed-job logs,
- `checks: write` to create or update the native CISignal check on the analyzed commit,
- `contents: read` to retrieve the commit diff,
- `issues: write` and `pull-requests: write` to maintain the optional PR comment.

Set `comment_on_pr: false` and remove `issues: write` and `pull-requests: write` to keep only the native Check Run output.

The file picker on [the public dashboard](https://ci-signal.vercel.app) is an optional local report inspector, not an installation or reporting step. The static dashboard does not yet list every future run automatically; the Check Run, PR comment, job summary, and bounded artifact are the automatic outputs.

## Production pinning

The starter uses the major tag `v1` for readability. Production repositories should pin both the reusable workflow and `cisignal_ref` to the same reviewed commit SHA:

```yaml
uses: Dannyso05/CISignal/.github/workflows/reusable-analysis.yml@<reviewed-commit-sha>
with:
  cisignal_ref: <reviewed-commit-sha>
```

This keeps the workflow definition and analyzer implementation on the same immutable revision.

## What this proves—and what remains

This integration is deliberately on the hackathon's practical line: it is a real cross-repository installation with least-privilege GitHub permissions, pinned code, pytest/Jest/Vitest/TypeScript support, bounded artifacts, and an idempotent PR report.

It is not a marketplace installation flow. The GitHub App webhook and Check Run path live separately in this repository and are the next step for one-click organization-wide onboarding, centralized private history, installation-token authentication, and branded checks.
