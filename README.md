# CISignal

**CISignal turns failed CI logs and a commit diff into a compact, cited evidence packet for coding agents—then learns across runs to recommend better engineering workflows.**

[Live dashboard](https://ci-signal.vercel.app) · [Live FastAPI proof](https://github.com/Dannyso05/fastapi/pull/1) · [Repository](https://github.com/Dannyso05/CISignal) · [Install in any repo](docs/INSTALL_ANY_REPO.md) · [Demo guide](DEMO.md)

The normal GitHub path is automatic: your existing CI workflow still runs its own tests, then a small `workflow_run` caller invokes CISignal only after that workflow completes with a failure. CISignal reads the completed failed-job logs and commit diff, publishes a neutral Check Run, updates one cited PR comment, and uploads a bounded evidence artifact. It does not rerun the test suite or replace the CI result.

## Live cross-repository proof

The FastAPI fork demonstrates the production-shaped path against FastAPI's existing, unmodified **Test** workflow—not a CISignal-owned test job.

| Verified fact | Live result |
| --- | --- |
| Source CI | [FastAPI Test run 32672867721](https://github.com/Dannyso05/fastapi/actions/runs/32672867721) |
| Real CI environment | Ubuntu, macOS, and Windows across FastAPI's Python matrix |
| Source conclusion | 17 failed checks in the completed workflow |
| CISignal observer | [Separate `workflow_run` analysis 32673072610](https://github.com/Dannyso05/fastapi/actions/runs/32673072610) |
| PR output | [Neutral CISignal check and idempotent comment](https://github.com/Dannyso05/fastapi/pull/1) |
| Likely origin | `test_health_contract` in `tests/cisignal_demo/test_app.py` |
| Related change | `tests/cisignal_demo/app.py` |
| Measured context | 42,068 log lines / 1,025,617 estimated tokens → 377-token packet (99.96% reduction) |

**No manual report upload is required for GitHub use.** The dashboard's file picker is only an optional, client-side inspector for a `report.json`; imported files stay in the browser. The PR check, comment, summary, and artifact are created automatically after the watched CI workflow fails.

The GitHub App webhook, branded Check Run path, and private Vercel Blob archive are also implemented for the one-click installation direction. See [GitHub App setup](docs/GITHUB_APP_SETUP.md).

## Local deterministic demo

> Demonstration metrics below were measured on the included synthetic fixture. They are not production benchmarks.

| Included fixture | Measured result |
| --- | ---: |
| Raw CI transcript | 72,418 lines / 1,205,770 estimated tokens |
| CISignal agent packet | 481 estimated tokens |
| Context reduction | 99.96% |
| Primary evidence | raw lines 42,002–42,010 |
| Golden checks | 28 unit/integration tests plus deterministic demo verification |

CISignal accelerates failure triage and agent repair loops; it does not make CI test execution itself faster.

### Three-command quickstart

Requires Node.js 20 or newer. The demo is pinned to seed `20260823`.

```bash
npm ci
npm run demo:generate -- --seed 20260823
npm run demo
```

Open the local URL printed by Vite. The dashboard starts on the checked-in live FastAPI proof. The engineering-insights page remains a clearly labeled synthetic history demonstration, and the optional file picker accepts a CISignal `report.json` without uploading it.

To verify everything without starting a server:

```bash
npm run build
npm run lint
npm test
npm run demo:generate -- --seed 20260823
npm run demo:verify
npm run dashboard:build
```

## Architecture

```mermaid
flowchart LR
    A[Existing CI workflow] -->|completed failure| B[workflow_run caller]
    B --> C[Read failed-job logs + commit diff]
    C --> D[Normalize + redact]
    D --> E[Parse + rank + correlate]
    E --> F[Budgeted evidence packet]
    F --> G[Neutral Check Run]
    F --> H[Idempotent PR comment]
    F --> I[Bounded artifact]
    E --> J[Versioned failure history]
    J --> K[Evidence-backed recommendations]
    I -. optional local inspection .-> L[Vite dashboard]
```

The live triage pipeline and historical insights share the same versioned `FailureRecord`; they are not separate mock applications.

## Analyze a local failure

```bash
npm run signalci -- analyze \
  --logs fixtures/noisy-jest-run/ci.log \
  --diff fixtures/noisy-jest-run/commit.diff \
  --run-id demo-run-001 \
  --repository Dannyso05/CISignal \
  --token-budget 2000 \
  --output-dir work/demo-run
```

Generated artifacts:

```text
work/demo-run/report.json          structured failure record
work/demo-run/context.md           bounded agent packet
work/demo-run/summary.md           human-readable summary
work/demo-run/history-record.json  ingestible history unit
```

The fixture is synthetic and models an expiry-boundary regression: `src/auth/token.ts` changes `<=` to `<`, a Jest assertion expects `401` but receives `200`, later auth-fixture failures cascade, and a generic exit arrives last.

## What the analyzer does

1. Preserves raw, one-based line indices while stripping ANSI, timestamps, progress noise, and runner-specific path prefixes from normalized values.
2. Parses Jest, Vitest, and pytest assertions, TypeScript compiler errors, and conservative generic errors.
3. Collapses normalized duplicates and groups only reasonable downstream cascade candidates.
4. Scores candidates with inspectable constants. Specific assertions and compiler errors rank above generic exits.
5. Parses unified diffs and labels matching changes as **likely related**, never as proven causes.
6. Creates a stable SHA-256 fingerprint after removing timestamps, UUIDs, paths, source positions, addresses, and random numeric suffixes.
7. Selects exact evidence under a strict estimated-token budget using the documented MVP estimator `ceil(characters / 4)`.

The report keeps facts and inferences distinguishable. Every primary conclusion maps back to raw log lines, and limitations remain visible.

## Historical insights

`FailureStore` abstracts persistence; the MVP uses atomic file-backed JSON writes and never stores complete raw logs by default.

```bash
npm run signalci -- history ingest work/demo-run/history-record.json --store data/history
npm run signalci -- history insights --store data/history --output work/insights.json
```

Deterministic rules identify recurring fingerprints, potential flakes from fail-then-pass evidence, cheap deterministic checks running late, shared-fixture cascade hotspots, and dependency/registry instability.

Every recommendation includes supporting run IDs, confidence, an action, methodology where impact is estimated, and caveats. CISignal analyzes the CI system—not individual engineers.

## GitHub Actions demonstration

For an external repository, CISignal watches the repository's existing CI by exact workflow name. The [FastAPI caller](https://github.com/Dannyso05/fastapi/blob/cisignal-integration/.github/workflows/cisignal.yml) watches `Test`; when `Test` succeeds, CISignal does nothing, and when it fails, CISignal analyzes that completed run.

This repository also includes five workflow files for verification and focused demonstrations:

- `Verify` proves a clean checkout can build, test, regenerate, verify, and bundle the dashboard.
- `Demo CI` manually runs one deliberately failing synthetic scenario and uploads the complete transcript even after failure.
- `CISignal Triage` runs after a failed `Demo CI`, downloads the transcript with only `actions: read` and `contents: read`, produces the standard artifacts, validates the report, and writes a GitHub job summary.
- `CISignal PR` analyzes the focused sample failure against the actual pull-request diff and publishes an updateable, cited PR comment.
- `CISignal reusable analysis` is the callable production-shaped analyzer used by other repositories.

From the GitHub **Actions** tab, run **Demo CI** and choose `expired-token`, `fixture-cascade`, or `typescript-error`. The failed conclusion is intentional and triggers the follow-up triage workflow.

The optional direct GitHub adapter is read-only:

```bash
GH_TOKEN=... npm run signalci -- github analyze \
  --repository owner/repository \
  --run-id 123456 \
  --base-sha def456 \
  --head-sha abc123 \
  --output-dir work/github-run
```

It requests only failed/timed-out job logs and the commit diff. Never place a token in a fixture, frontend variable, job summary, or repository-controlled test process.

## Install in another repository

The reusable workflow at [`.github/workflows/reusable-analysis.yml`](.github/workflows/reusable-analysis.yml) makes CISignal consumable without copying the analyzer into the target repository. A target repo adds one small `workflow_run` caller, then receives a native **CISignal** Check Run on the analyzed commit, bounded artifacts, a job summary, and an optional updateable PR comment when its existing CI fails.

See the [five-minute installation guide](docs/INSTALL_ANY_REPO.md) and [copyable caller workflow](examples/github-actions/cisignal.yml). The workflow uses only the target repository's short-lived `GITHUB_TOKEN`; no shared GitHub or OpenAI secret is required.

Once the caller is committed to the target repository's default branch, there is no manual trigger or report upload: push or open a PR as usual and let the watched CI workflow run.

## Codex handoff

The deterministic analyzer has no required OpenAI API call. Generate a bounded, human-controlled handoff with:

```bash
npm run signalci -- diagnose \
  --report work/demo-run/report.json \
  --output-dir work
```

CISignal writes `work/codex-prompt.md` and prints an explicit non-interactive Codex command using a workspace-write sandbox and `schemas/codex-result.schema.json`. It does not silently start an agent, push a patch, open a pull request, or expose credentials.

## Dashboard and deployment

The static Vite/React dashboard provides:

- `/run/fastapi-32672867721` — the checked-in live FastAPI proof with links to the source CI, analyzer run, Check Run, exact evidence, related diff, and packet preview,
- `/insights` — category distribution, fingerprint recurrence, potential-flake evidence, and prioritized recommendations,
- `/methodology` — scoring, token estimation, and claim boundaries,
- optional client-side `report.json` validation and inspection.

Vercel reads the checked-in [`vercel.json`](vercel.json):

```text
Install command: npm ci
Build command: npm run dashboard:build
Output directory: dashboard/dist
Production branch: main
```

Vercel redeploys automatically whenever `main` is pushed; no manual deployment upload is required. The reusable-workflow path also needs no backend, API key, or custom domain. Route rewrites make direct URL refreshes work.

The public dashboard is a static product demo, not yet a live index of every future repository run. Automatic results appear natively in GitHub checks and PR comments. A centralized, continuously updating web feed uses the separate GitHub App webhook and private Blob archive path.

## Security model

- Redacts likely bearer tokens, GitHub/OpenAI-style keys, cloud credential formats, password assignments, authorization headers, and private-key blocks before persistence or agent handoff.
- Treats logs, diffs, filenames, and error messages as untrusted data.
- Never executes commands extracted from logs.
- Derives reproduction commands only from known framework patterns and marks them unverified until run.
- Persists normalized records and bounded evidence spans, not complete logs.
- Keeps frontend JavaScript free of GitHub, Vercel, and OpenAI secrets.

## Repository map

```text
src/                 analyzer, parsers, scoring, packing, history, integrations
dashboard/           static React dashboard and bundled generated demo data
demo/                fixed-seed generator, manifest, and golden verification
fixtures/            synthetic noisy log, diff, expected result, history records
schemas/             report and Codex-result JSON schemas
tests/               deterministic unit, integration, and golden fixture tests
.github/workflows/   verification, deliberate failure, and follow-up triage
```

## Known limitations

- Jest, Vitest, pytest, and TypeScript receive structured support; generic parsing is intentionally conservative.
- Cascade detection and diff correlation are heuristics and do not establish causation.
- The token estimator is an MVP approximation, not tokenizer output.
- Historical demo records are synthetic and clearly labeled.
- The GitHub adapter analyzes completed logs; it is not a multi-provider CI ingestion service.
- The static dashboard does not automatically discover new reusable-workflow runs; GitHub Checks and PR comments are the automatic production output today.
- Codex patch generation and verification remain explicit, separately recorded actions.

## License

[MIT](LICENSE)
