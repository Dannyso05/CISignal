# SignalCI Demo

All included failure logs and historical records are deterministic synthetic demonstration data.

## Judge path — 60 seconds

1. Open the hosted Vercel URL (production alias pending first deployment).
2. Read `72,418 raw lines → 481 estimated tokens` and the measured `99.96%` reduction.
3. Open **Current failure** and show the expired-token assertion at raw lines 42,002–42,010.
4. Show `src/auth/token.ts` as likely related, explicitly labeled correlation.
5. Follow the origin-to-cascade timeline and bounded agent packet.
6. Open **Engineering insights** and expand the top recommendation to show its run-level evidence and caveat.

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

## GitHub Actions path

1. Open **Actions → Demo CI → Run workflow**.
2. Choose `expired-token`.
3. The deliberate failure uploads `ci.log` and ends visibly red.
4. **SignalCI Triage** starts automatically, analyzes the transcript, writes the job summary, and uploads `report.json`, `context.md`, and `summary.md`.
5. Download `report.json` and drop it onto the hosted dashboard; validation and rendering happen entirely in the browser.

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

Close with: **“SignalCI helps agents fix today’s failure and helps teams prevent tomorrow’s.”**

Never call a proposed patch verified unless the original reproduction command actually passed.
