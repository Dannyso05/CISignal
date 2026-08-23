# SignalCI Pitch

## Three-minute version

### 0:00–0:20 — Hook

Coding agents can create a pull request in minutes. Then CI fails and we hand that agent tens of thousands of lines of logs. We spend expensive context on package downloads, repeated stack traces, and the final unhelpful message: exit code one.

### 0:20–0:40 — Product

SignalCI is the context layer between CI and coding agents. It identifies the likely originating failure, cites the exact evidence, connects it to the diff, and produces a packet with a strict token budget.

### 0:40–1:35 — Current-run demo

This synthetic run produced 72,418 lines—about 1.2 million estimated tokens. SignalCI selected 481 estimated tokens. It found the expired-token assertion before the later authentication failures, linked it to the expiry-boundary change, and preserved raw lines 42,002 through 42,010.

Show the failure, evidence, diff, cascade timeline, packet, and explicit verification status.

### 1:35–2:15 — Historical insights

The same normalized record is stored across every run. SignalCI can see that a fingerprint happened repeatedly, distinguish potential flakes from consistent regressions, and recommend concrete changes to the PR process. Every recommendation expands to the supporting runs, methodology, confidence, and caveats.

### 2:15–2:40 — Technical credibility

This is not an LLM summarizer. SignalCI deterministically parses failure events, identifies likely origins and cascades, correlates the git diff, creates stable fingerprints, and solves a bounded evidence-selection problem. Codex reasons over the result instead of cleaning the log.

### 2:40–3:00 — Close

CI emits transcripts for humans. SignalCI emits evidence for agents—and turns every failure into a lesson for the engineering team. Fix today. Prevent tomorrow.

## Ninety-second fallback

- 0:00–0:15 — problem and hook,
- 0:15–0:30 — deterministic architecture,
- 0:30–1:00 — hosted current-run evidence,
- 1:00–1:15 — historical recommendation,
- 1:15–1:30 — measured result and close.

Never skip the evidence citation or measured comparison. Never say “verified fix” unless the original reproduction passed.

## Recovery matrix

- **GitHub is slow:** use the stored failed run and generated artifacts.
- **Vercel is unavailable:** run `npm run demo` and use identical bundled data locally.
- **Codex takes too long:** show a clearly labeled recorded result and run only reproduction live.
- **Repair fails:** show the correct triage and label the patch unverified.
- **Event Wi-Fi fails:** use local dashboard and fixture.
- **Fixture output changes:** run `npm run demo:verify`; return to the known-good commit rather than changing expected values.

## Claim boundary

SignalCI accelerates failure triage and agent repair loops; it does not make CI test execution itself faster.
