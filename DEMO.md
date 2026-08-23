# CISignal Demo

The current-failure page uses a real completed FastAPI CI run. The learning-over-time history is deterministic synthetic demonstration data and is labeled everywhere it appears.

## Judge path — 90 seconds

1. Open [ci-signal.vercel.app](https://ci-signal.vercel.app) and identify the live FastAPI proof.
2. Open **Source CI** to show FastAPI's own `Test` matrix, then **CISignal run** to show the separate post-CI observer.
3. Read the measured `41,966 raw lines → 379 estimated tokens` and `99.96%` reduction.
4. Show `test_health_contract`, its timestamped evidence, and the related `tests/cisignal_demo/app.py` change.
5. Scroll to **From one failure to engineering memory** and open **Learn over time**.
6. State the provenance clearly: 24 labeled generated records demonstrate the history feature; they are not production telemetry.
7. Follow the learning loop: 24 stored records → 11 matching fingerprints → 3 rerun passes → 5 supported actions.
8. Expand the top recommendation to show its contributing run IDs, confidence, action, methodology, and caveat.

## Developer path

```bash
git clone https://github.com/Dannyso05/CISignal.git
cd CISignal
npm ci
npm test
npm run demo:generate -- --seed 20260823
npm run demo:verify
npm run demo
```

## Automatic pull-request path

1. Open the [FastAPI proof pull request](https://github.com/Dannyso05/fastapi/pull/2).
2. Show the failed checks from FastAPI's existing **Test** workflow.
3. Open the neutral **CISignal** check and the single updateable CISignal comment.
4. Follow its link to the separate post-CI analyzer run and bounded artifact.

No report download or dashboard upload is required for this path.

## Synthetic GitHub Actions path

1. Open **Actions → Demo CI → Run workflow**.
2. Choose `expired-token`.
3. The deliberate failure uploads `ci.log` and ends visibly red.
4. **CISignal Triage** starts automatically, analyzes the transcript, writes the job summary, and uploads `report.json`, `context.md`, and `summary.md`.
5. Downloading `report.json` for optional browser-only inspection is available, but it is not part of the automatic pull-request integration above.

## Terminal walkthrough

```bash
npm run signalci -- analyze \
  --logs fixtures/noisy-jest-run/ci.log \
  --diff fixtures/noisy-jest-run/commit.diff \
  --run-id demo-run-001 \
  --token-budget 2000 \
  --output-dir work/demo-run

npm run signalci -- validate work/demo-run/report.json
npm run signalci -- diagnose --report work/demo-run/report.json --output-dir work
```

Show in this order: raw measurements, cited primary failure, changed-file correlation, collapsed cascades, bounded `context.md`, explicit Codex handoff, fingerprint recurrence, and an evidence-backed recommendation.

Close with: **“CISignal helps agents fix today’s failure and helps teams prevent tomorrow’s.”**

Never call a proposed patch verified unless the original reproduction command actually passed.
