# CISignal GitHub App setup

CISignal can run as an installed GitHub App, publish a branded `CISignal` Check Run, annotate the likely originating failure, update one PR comment, and archive redacted failed-job logs in private Vercel Blob storage.

## What GitHub stores

GitHub Actions keeps workflow logs and artifacts for a retention window (90 days by default). A GitHub App does not receive an arbitrary persistent filesystem or database. CISignal therefore treats GitHub as the source of the run and copies each failed job's redacted log plus its generated report into private object storage.

Archive objects use this deterministic shape:

```text
cisignal/{installation}/{owner}/{repo}/{head-sha}/{source-check-id}/
  failure.log
  report.json
  context.md
  summary.md
  manifest.json
```

Private objects require the Vercel Blob token. `/api/archive?pathname=...` also requires a separate `CISIGNAL_ARCHIVE_TOKEN`; it never exposes storage publicly.

## 1. Register the app

Open GitHub **Settings → Developer settings → GitHub Apps → New GitHub App**.

- GitHub App name: `CISignal` (or a globally unique variant)
- Homepage URL: `https://ci-signal.vercel.app`
- Webhook URL: `https://ci-signal.vercel.app/api/github/webhook`
- Webhooks: Active
- Webhook secret: generate a long random value and save it
- Where can this app be installed: **Only on this account** for the MVP

Repository permissions:

- Actions: Read-only
- Checks: Read and write
- Contents: Read-only
- Issues: Read and write
- Pull requests: Read and write

Subscribe to these events:

- Check run
- Check suite
- Pull request

Create the app, note its App ID, and generate a private key. Never commit the private key or webhook secret.

For the badge, upload [`assets/cisignal-app-icon.png`](../assets/cisignal-app-icon.png). It is already the recommended 200 × 200 PNG; use `#c8ff42` as the badge background color.

## 2. Create private log storage

In the connected Vercel project, open **Storage → Create Database → Blob** and create a **Private** store. Connecting the store adds `BLOB_READ_WRITE_TOKEN` to the project automatically.

## 3. Add Vercel environment variables

Copy the names in `.env.example` into Vercel project settings:

```text
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
BLOB_READ_WRITE_TOKEN
CISIGNAL_ARCHIVE_TOKEN
CISIGNAL_PUBLIC_URL=https://ci-signal.vercel.app
```

`CISIGNAL_ARCHIVE_TOKEN` should be an independent random secret. Redeploy after saving the values.

## 4. Install and test

Install the app only on `Dannyso05/CISignal`, then verify:

```bash
curl https://ci-signal.vercel.app/api/github/webhook
```

The response should report both `configured: true` and `storageConfigured: true`.

Push a commit to the demo PR. CISignal will:

1. create a queued check on the PR head;
2. wait for GitHub Actions;
3. download a failed GitHub Actions job log;
4. run deterministic analysis against the PR diff;
5. archive the redacted bundle privately;
6. update its branded check and PR comment.

Once the App is confirmed working, disable `.github/workflows/signalci-pr.yml` to avoid showing both the temporary Actions-based report and the App-based report on the same PR.

## Production hardening

The MVP uses Vercel `waitUntil()` so GitHub receives an immediate webhook acknowledgement. Before enabling many repositories, put deliveries onto a durable queue, record delivery IDs for deduplication, add authenticated dashboard sessions, configure explicit archive retention, and document deletion/export behavior.
