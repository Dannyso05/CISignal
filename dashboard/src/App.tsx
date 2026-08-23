import { useEffect, useMemo, useRef, useState } from "react";
import type { FailureRecord, InsightReport, Recommendation } from "../../src/types";

interface DashboardData {
  demoVersion: string;
  generatedAt: string;
  synthetic: boolean;
  deployedCommit: string;
  provenance: {
    seed: number;
    scenario: string;
    fixturePath: string;
    tokenBudget: number;
    tokenEstimator: string;
    historyRecords: number;
    generatorCommand: string;
    verificationCommand: string;
  };
  currentRun: FailureRecord;
  insights: InsightReport;
  history: Array<{
    runId: string;
    classification: string;
    fingerprint: string;
    conclusion: string;
    attemptNumber?: number;
    cascadingFailures: number;
  }>;
  contextPacket: string;
}

interface LiveProof {
  observedAt: string;
  repository: string;
  workflowName: string;
  failedChecks: number;
  platforms: string[];
  pullRequestUrl: string;
  sourceRunUrl: string;
  analysisRunUrl: string;
  checkRunUrl: string;
  report: FailureRecord;
}

type View = "run" | "insights" | "methodology";

function viewFromPath(): View {
  if (window.location.pathname.startsWith("/insights")) return "insights";
  if (window.location.pathname.startsWith("/methodology")) return "methodology";
  return "run";
}

function formatKind(kind: string): string {
  return kind.replaceAll("_", " ");
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return "High heuristic match";
  if (confidence >= 0.65) return "Moderate heuristic match";
  return "Needs review";
}

function validReport(value: unknown): value is FailureRecord {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<FailureRecord>;
  return report.schemaVersion === "0.1"
    && typeof report.runId === "string"
    && typeof report.fingerprint === "string"
    && typeof report.confidence === "number"
    && Boolean(report.primaryFailure)
    && Array.isArray(report.evidence)
    && typeof report.compression?.packetEstimatedTokens === "number";
}

function Logo() {
  return <a className="brand" href="/" onClick={(event) => event.preventDefault()} aria-label="CISignal home">
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
    <span><span>CI</span>Signal</span>
  </a>;
}

function AppShell({ children, view, navigate }: { children: React.ReactNode; view: View; navigate: (view: View) => void }) {
  return <div className="app-shell">
    <header className="topbar">
      <Logo />
      <nav aria-label="Primary navigation">
        <button className={view === "run" ? "active" : ""} onClick={() => navigate("run")}>Current failure</button>
        <button className={view === "insights" ? "active" : ""} onClick={() => navigate("insights")}>Learn over time</button>
        <button className={view === "methodology" ? "active" : ""} onClick={() => navigate("methodology")}>Methodology</button>
      </nav>
      <a className="github-link" href="https://github.com/Dannyso05/CISignal" target="_blank" rel="noreferrer">GitHub <span>↗</span></a>
    </header>
    <main>{children}</main>
    <footer>
      <span>CISignal · Evidence for agents, not another log viewer.</span>
      <span>Current failure: live FastAPI proof · Learning demo: labeled synthetic history · commit <code>{__SIGNALCI_COMMIT__}</code></span>
    </footer>
  </div>;
}

function Citation({ start, end }: { start: number; end: number }) {
  return <span className="citation">L{start.toLocaleString()}–L{end.toLocaleString()}</span>;
}

function ImportReport({ onReport }: { onReport: (report: FailureRecord) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const load = async (file?: File) => {
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!validReport(value)) throw new Error("Expected a CISignal schemaVersion 0.1 report with failure evidence and compression metrics.");
      setError("");
      onReport(value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The report could not be read.");
    }
  };

  return <div className="import-wrap">
    <button
      className={`import-button ${dragging ? "dragging" : ""}`}
      onClick={() => input.current?.click()}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void load(event.dataTransfer.files[0]); }}
    >
      <span className="upload-icon">↑</span>
      <span><strong>Inspect a report file (optional)</strong><small>No upload is needed for automatic PR reporting</small></span>
    </button>
    <input ref={input} type="file" accept="application/json,.json" hidden onChange={(event) => void load(event.target.files?.[0])} />
    {error && <p className="import-error" role="alert">{error}</p>}
  </div>;
}

function Metric({ value, label, tone = "default" }: { value: string; label: string; tone?: string }) {
  return <div className={`metric ${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function CurrentFailure({ demo, live, report, onReport }: { demo: DashboardData; live: LiveProof; report: FailureRecord; onReport: (report: FailureRecord) => void }) {
  const primaryEvidence = report.evidence.find((item) => item.eventId === report.primaryFailure.id) ?? report.evidence[0];
  const percent = Math.round(report.confidence * 100);
  const rawTokens = report.compression.rawEstimatedTokens;
  const packetTokens = report.compression.packetEstimatedTokens;
  const isLive = report.runId === live.report.runId;
  const isFixture = report.runId === demo.currentRun.runId;
  const custom = !isLive && !isFixture;
  const budget = isFixture ? demo.provenance.tokenBudget : undefined;
  const relatedPath = report.relatedChanges[0]?.file;
  const relatedHunk = report.changedFiles.find((file) => file.path === relatedPath)?.hunks?.[0];
  const changedLines = relatedHunk?.split("\n").filter((line) => (line.startsWith("+") && !line.startsWith("+++")) || (line.startsWith("-") && !line.startsWith("---"))) ?? [];
  const recurringDemoRuns = demo.history.filter((item) => item.fingerprint === demo.currentRun.fingerprint);
  const matchingRerunPasses = recurringDemoRuns.filter((item) => item.conclusion === "success").length;

  return <>
    <section className="hero page-grid">
      <div className="hero-copy">
        <div className="eyebrow"><span className="status-dot" /> {isLive ? "Live cross-repository proof · FastAPI" : custom ? "Imported report · local only" : "Synthetic fixture · deterministic analysis"}</div>
        <h1>Your CI fails.<br /><em>CISignal explains why.</em></h1>
        <p>Your existing CI still owns checkout, environments, and tests. After it completes, CISignal automatically reads the failed-job logs and commit diff, then posts cited failure intelligence back to the pull request.</p>
      </div>
      <aside className="integration-panel">
        <span>Verified production-shaped flow</span>
        <strong>{live.repository} · {live.workflowName}</strong>
        <p>{live.failedChecks} failed checks across {live.platforms.join(", ")}. CISignal ran afterward through <code>workflow_run</code>.</p>
        <div className="proof-links">
          <a href={live.pullRequestUrl} target="_blank" rel="noreferrer">Open PR ↗</a>
          <a href={live.sourceRunUrl} target="_blank" rel="noreferrer">Source CI ↗</a>
          <a href={live.analysisRunUrl} target="_blank" rel="noreferrer">CISignal run ↗</a>
        </div>
        <ImportReport onReport={onReport} />
      </aside>
      <div className="compression-card">
        <div className="compression-flow">
          <div><strong>{report.compression.rawLines.toLocaleString()}</strong><span>raw lines</span></div>
          <div className="flow-line"><span /></div>
          <div><strong>{packetTokens.toLocaleString()}</strong><span>est. tokens</span></div>
        </div>
        <div className="reduction"><strong>{report.compression.reductionPercent.toFixed(2)}%</strong><span>context reduction</span></div>
        <div className="budget-track"><span style={{ width: `${budget ? Math.min(100, (packetTokens / budget) * 100) : 100}%` }} /></div>
        <small>{budget ? `${packetTokens.toLocaleString()} of ${budget.toLocaleString()} token budget` : `${packetTokens.toLocaleString()} packet tokens`} · raw estimate {rawTokens.toLocaleString()} · estimator {demo.provenance.tokenEstimator}</small>
      </div>
      <aside className="provenance-card full-span">
        <div><span>Where these numbers come from</span><strong>{isLive ? "Completed GitHub Actions jobs" : custom ? "Imported report values" : "Reproducible fixture measurements"}</strong></div>
        <p>{isLive
          ? `Measured from FastAPI Test run ${report.runId}. GitHub ran the real OS/Python matrix first; CISignal then analyzed its completed failed-job logs without rerunning pytest.`
          : custom
          ? "This report was loaded from your browser. Its values come from that file; CISignal does not upload it or mix it with the bundled demo history."
          : `This is not production telemetry. The ${report.compression.rawLines.toLocaleString()} lines are generated from the fixed ${demo.provenance.scenario} scenario, then analyzed locally with deterministic code.`}</p>
        {isLive ? <div className="provenance-tags">
          <a href={live.sourceRunUrl} target="_blank" rel="noreferrer">FastAPI Test run</a>
          <a href={live.checkRunUrl} target="_blank" rel="noreferrer">Neutral CISignal check</a>
          <code>automatic · no manual upload</code>
        </div> : !custom && <div className="provenance-tags">
          <code>seed {demo.provenance.seed}</code>
          <code>{demo.provenance.fixturePath}</code>
          <code>{demo.provenance.verificationCommand}</code>
        </div>}
      </aside>
    </section>

    <section className="content-section page-grid">
      <div className="section-heading full-span">
        <div><span className="section-index">01</span><h2>Likely originating failure</h2></div>
        <span className="run-id">RUN / {report.runId}</span>
      </div>
      <article className="failure-card span-8">
        <div className="failure-topline">
          <span className="kind-pill">{formatKind(report.classification)}</span>
          <Citation start={report.primaryFailure.rawStart} end={report.primaryFailure.rawEnd} />
        </div>
        <h3>{report.primaryFailure.testName ?? report.primaryFailure.message}</h3>
        <p className="failure-message">{report.primaryFailure.message}</p>
        <div className="file-path"><span>↳</span><code>{report.primaryFailure.file ?? "location unavailable"}{report.primaryFailure.sourceLine ? `:${report.primaryFailure.sourceLine}` : ""}</code></div>
        <div className="fact-note"><strong>Inference, not probability.</strong> The displayed score is a deterministic ranking heuristic derived from assertion specificity, ordering, diff correlation, and duplicate/cascade penalties.</div>
      </article>
      <aside className="confidence-card span-4">
        <span>Heuristic confidence</span>
        <div className="confidence-number">{percent}<small>%</small></div>
        <div className="confidence-track"><span style={{ width: `${percent}%` }} /></div>
        <strong>{confidenceLabel(report.confidence)}</strong>
        <p>{report.primaryFailure.evidenceReasons.slice(0, 3).join(" · ")} · not a calibrated probability</p>
      </aside>

      <article className="evidence-card span-7">
        <div className="card-label"><span>Exact evidence</span><Citation start={primaryEvidence?.rawStart ?? report.primaryFailure.rawStart} end={primaryEvidence?.rawEnd ?? report.primaryFailure.rawEnd} /></div>
        <pre>{primaryEvidence?.text ?? "Evidence unavailable"}</pre>
      </article>
      <article className="diff-card span-5">
        <div className="card-label"><span>Likely related change</span><span className="correlation">correlation</span></div>
        <code>{report.relatedChanges[0]?.file ?? "No related change"}</code>
        <p>{report.relatedChanges[0]?.reasons.join(". ") || "No changed file crossed the relevance threshold."}</p>
        {changedLines.length > 0 && <div className="mini-diff">
          {changedLines.map((line) => line.startsWith("+") ? <strong key={line}>{line}</strong> : <span key={line}>{line}</span>)}
        </div>}
      </article>
    </section>

    <section className="dark-section">
      <div className="page-grid">
        <div className="section-heading full-span inverse">
          <div><span className="section-index">02</span><h2>Origin before cascade</h2></div>
          <span className="run-id">{report.cascadingFailures.length} SECONDARY EVENTS COLLAPSED</span>
        </div>
        <div className="timeline span-7">
          <div className="timeline-item origin"><span className="timeline-node" /><div><small>ORIGIN · L{report.primaryFailure.rawStart.toLocaleString()}</small><strong>{report.primaryFailure.testName ?? report.primaryFailure.message}</strong><p>Specific assertion · highest evidence score</p></div></div>
          {report.cascadingFailures.slice(0, 3).map((failure, index) => <div className="timeline-item" key={failure.id}><span className="timeline-node" /><div><small>CASCADE {index + 1} · L{failure.rawStart.toLocaleString()}</small><strong>{failure.testName ?? failure.message}</strong><p>Collapsed beneath {report.primaryFailure.id}</p></div></div>)}
          {isLive
            ? <div className="timeline-item exit"><span className="timeline-node" /><div><small>SOURCE WORKFLOW</small><strong>FastAPI Test completed: failure</strong><p>CISignal observed this result afterward; it did not execute the test.</p></div></div>
            : <div className="timeline-item exit"><span className="timeline-node" /><div><small>FINAL PROCESS EXIT</small><strong>Generic exit code 1</strong><p>Low-value secondary signal</p></div></div>}
        </div>
        <div className="packet-card span-5">
          <div className="packet-header"><span>AGENT_PACKET.md</span><span>{packetTokens} TOKENS</span></div>
          <div className="packet-body">
            <small>## Task for Codex</small>
            <p>Find the smallest likely fix, avoid unrelated edits, run the reproduction command, and report verification evidence.</p>
            <small>## Reproduction</small>
            <code>{report.reproduce?.command ?? "Not safely derivable"}</code>
            <small>## Verification</small>
            <p><span className="pending-dot" /> Not run · explicit handoff required</p>
          </div>
        </div>
      </div>
    </section>

    <section className="learning-bridge">
      <div className="page-grid">
        <div className="span-8 learning-bridge-copy">
          <div className="eyebrow"><span className="status-dot" /> From one failure to engineering memory</div>
          <h2>CISignal learns the pattern,<br />not the person.</h2>
          <p>Each bounded failure record adds a stable fingerprint, classification, attempt result, and cited evidence. Across runs, CISignal can surface recurrence, possible flakes, cascade hotspots, and cheaper workflow ordering.</p>
        </div>
        <aside className="learning-bridge-card span-4">
          <div><strong>{demo.insights.totalRuns}</strong><span>labeled history records</span></div>
          <div><strong>{recurringDemoRuns.length}</strong><span>matching fingerprint runs</span></div>
          <div><strong>{matchingRerunPasses}</strong><span>matching rerun passes</span></div>
          <div><strong>{demo.insights.recommendations.length}</strong><span>cited recommendations</span></div>
          <a href="/insights">Open the learning-over-time demo →</a>
        </aside>
      </div>
    </section>

    <section className="content-section page-grid">
      <div className="section-heading full-span">
        <div><span className="section-index">04</span><h2>Transparent limitations</h2></div>
      </div>
      {report.limitations.map((limitation, index) => <article className="limitation span-4" key={limitation}><span>0{index + 1}</span><p>{limitation}</p></article>)}
    </section>
  </>;
}

function RecommendationCard({ item, rank }: { item: Recommendation; rank: number }) {
  const [open, setOpen] = useState(rank === 1);
  return <article className={`recommendation ${open ? "open" : ""}`}>
    <button onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="recommendation-rank">0{rank}</span>
      <span className="recommendation-title"><small>{item.type}</small><strong>{item.title}</strong></span>
      <span className="recommendation-confidence">{Math.round(item.confidence * 100)}%<small>confidence</small></span>
      <span className="expand">{open ? "−" : "+"}</span>
    </button>
    {open && <div className="recommendation-details">
      <div><small>Finding</small><p>{item.explanation}</p></div>
      <div><small>Action</small><p>{item.action}</p></div>
      <div><small>Evidence</small><p>{item.evidence.slice(0, 4).map((entry) => entry.runId).join(" · ")} · {item.evidence[0]?.metric}</p></div>
      {item.estimatedImpact && <div><small>Estimated impact</small><p>{item.estimatedImpact.value} {item.estimatedImpact.unit.replaceAll("_", " ")} · {item.estimatedImpact.methodology}</p></div>}
      <div className="caveat"><small>Caveat</small><p>{item.caveats.join(" ")}</p></div>
    </div>}
  </article>;
}

function Insights({ demo }: { demo: DashboardData }) {
  const { insights } = demo;
  const maxCategory = Math.max(...Object.values(insights.categoryCounts));
  const categories = Object.entries(insights.categoryCounts).sort((a, b) => b[1] - a[1]);
  const recurring = demo.history.filter((item) => item.fingerprint === demo.currentRun.fingerprint);
  const matchingRerunPasses = recurring.filter((item) => item.conclusion === "success").length;
  const firstAttemptFailures = Math.round(insights.firstAttemptFailureRate * insights.totalRuns);

  return <>
    <section className="insights-hero page-grid">
      <div className="span-8">
        <div className="eyebrow"><span className="status-dot" /> Learning-over-time demo · {insights.totalRuns} labeled records</div>
        <h1>One failure is evidence.<br /><em>Repetition is a system.</em></h1>
        <p>This deliberately constructed history shows the full learning loop without pretending one FastAPI run is production telemetry. Stable fingerprints connect related runs; result and attempt changes add context; deterministic rules turn the pattern into cited actions.</p>
      </div>
      <div className="insight-metrics span-4">
        <Metric value={String(insights.totalRuns)} label="seeded fixture records" />
        <Metric value={String(insights.recurringFingerprints)} label="fingerprints seen 3+ times" tone="accent" />
        <Metric value={`${firstAttemptFailures} / ${insights.totalRuns}`} label="first-attempt failures" />
        <Metric value={String(insights.potentialFlakes)} label="fail-then-pass pattern" />
      </div>
    </section>

    <section className="learning-demo page-grid">
      <div className="section-heading full-span"><div><span className="section-index">01</span><h2>How the memory compounds</h2></div><span className="run-id">DETERMINISTIC · INSPECTABLE</span></div>
      <div className="learning-steps full-span">
        <article><span>01 · STORE</span><strong>{insights.totalRuns} bounded records</strong><p>Every analyzed run contributes a classification, stable fingerprint, attempt result, evidence spans, and related changes—not complete raw logs.</p></article>
        <article><span>02 · MATCH</span><strong>{recurring.length} related occurrences</strong><p>Normalization removes unstable timestamps and IDs so the same token-expiry behavior can be recognized across separate runs.</p></article>
        <article><span>03 · COMPARE</span><strong>{matchingRerunPasses} rerun passes</strong><p>Matching failures followed by passes without a relevant change become possible-flake evidence, never an automatic accusation.</p></article>
        <article><span>04 · RECOMMEND</span><strong>{insights.recommendations.length} supported actions</strong><p>Rules cite the contributing run IDs, state confidence and methodology, and keep a caveat beside every recommendation.</p></article>
      </div>
    </section>

    <section className="content-section page-grid">
      <div className="section-heading full-span"><div><span className="section-index">02</span><h2>Failure system, not people</h2></div><span className="run-id">NO ENGINEER RANKINGS</span></div>
      <article className="category-chart span-6">
        <div className="card-label"><span>Failure categories</span><span>{insights.failedRuns} failed fixture records</span></div>
        {categories.map(([category, count]) => <div className="bar-row" key={category}>
          <span>{formatKind(category)}</span>
          <div><i style={{ width: `${(count / maxCategory) * 100}%` }} /></div>
          <strong>{count}</strong>
        </div>)}
        <p className="takeaway"><strong>Takeaway:</strong> assertion and typecheck failures are the biggest deterministic opportunities in this fixture.</p>
      </article>
      <article className="fingerprint-panel span-6">
        <div className="card-label"><span>Repeated fingerprint</span><span className="correlation">stable hash</span></div>
        <code>{demo.currentRun.fingerprint.slice(0, 16)}…</code>
        <div className="frequency-number"><strong>{recurring.length}</strong><span>occurrences</span></div>
        <div className="run-dots" aria-label={`${recurring.length} matching run records`}>
          {recurring.map((item) => <i className={item.conclusion === "success" ? "pass" : "fail"} key={item.runId} title={`${item.runId}: ${item.conclusion}`} />)}
        </div>
        <p className="takeaway"><strong>Takeaway:</strong> matching failures plus later rerun passes justify investigation—not a definitive flake label.</p>
      </article>
    </section>

    <section className="dark-section recommendations-section">
      <div className="page-grid">
        <div className="section-heading full-span inverse"><div><span className="section-index">03</span><h2>Recommendations backed by stored runs</h2></div><span className="run-id">EVIDENCE REQUIRED</span></div>
        <div className="recommendations full-span">
          {insights.recommendations.slice(0, 5).map((item, index) => <RecommendationCard item={item} rank={index + 1} key={item.id} />)}
        </div>
      </div>
    </section>
  </>;
}

function Methodology({ demo }: { demo: DashboardData }) {
  const weights = [["Explicit failed assertion", "+10"], ["Compiler/typechecker error", "+8"], ["Changed file reference", "+5"], ["Stack references changed file", "+4"], ["Normalized duplicate", "−3"], ["Generic process exit", "−5"]];
  const report = demo.currentRun;
  return <>
    <section className="method-hero page-grid">
      <div className="span-8"><div className="eyebrow"><span className="status-dot" /> Inspectable by design</div><h1>Evidence selection,<br /><em>not log summarization.</em></h1><p>CISignal runs deterministic transforms before any agent handoff. Every inference keeps a path back to raw, one-based log lines.</p></div>
    </section>
    <section className="content-section page-grid">
      <div className="section-heading full-span"><div><span className="section-index">01</span><h2>Pipeline</h2></div></div>
      {[["Normalize", "Strip ANSI, extract timestamps, redact secrets, preserve raw line indices."], ["Parse", "Recognize Jest assertions, TypeScript errors, and generic process failures."], ["Rank", "Score specificity, ordering, duplicates, changed files, and likely cascades."], ["Pack", "Select exact evidence and related hunks under a strict estimated-token budget."]].map(([title, copy], index) => <article className="method-step span-3" key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}
      <article className="weights span-6"><div className="card-label"><span>Transparent score weights</span><span>v0.1</span></div>{weights.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</article>
      <article className="method-copy span-6"><h3>What the numbers mean</h3><p>Token counts use the documented estimate <code>{demo.provenance.tokenEstimator}</code>. Confidence is a bounded ranking heuristic derived from the winning score, event specificity, and distance from the next candidate.</p><p>Neither confidence nor diff correlation is presented as causation. The percentage is not a calibrated probability.</p><p>All fixture metrics are reproducible measurements from the included synthetic scenario—not production benchmarks.</p></article>
      <article className="metric-ledger full-span">
        <div className="card-label"><span>Metric provenance</span><span>seed {demo.provenance.seed}</span></div>
        <div className="ledger-grid">
          <div><strong>{report.compression.rawLines.toLocaleString()}</strong><span>raw lines</span><p>Counted in <code>{demo.provenance.fixturePath}</code>.</p></div>
          <div><strong>{report.compression.rawEstimatedTokens.toLocaleString()}</strong><span>raw estimated tokens</span><p>Computed with <code>{demo.provenance.tokenEstimator}</code>.</p></div>
          <div><strong>{report.compression.packetEstimatedTokens.toLocaleString()}</strong><span>packet estimated tokens</span><p>The same estimator applied to the generated evidence packet.</p></div>
          <div><strong>{report.compression.reductionPercent.toFixed(2)}%</strong><span>context reduction</span><p><code>1 − packet tokens / raw tokens</code>.</p></div>
          <div><strong>{Math.round(report.confidence * 100)}%</strong><span>heuristic confidence</span><p>Bounded score-gap output; not an empirical probability.</p></div>
          <div><strong>{demo.provenance.historyRecords}</strong><span>history records</span><p>Generated scenarios used only to demonstrate aggregation.</p></div>
        </div>
        <div className="verification-command"><span>Reproduce it</span><code>{demo.provenance.generatorCommand}</code><code>{demo.provenance.verificationCommand}</code></div>
      </article>
    </section>
  </>;
}

export function App() {
  const [demo, setDemo] = useState<DashboardData>();
  const [live, setLive] = useState<LiveProof>();
  const [report, setReport] = useState<FailureRecord>();
  const [view, setView] = useState<View>(viewFromPath());
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/data/demo-dashboard.json").then((response) => response.ok ? response.json() : Promise.reject(new Error(`Demo data returned ${response.status}`))),
      fetch("/data/fastapi-live-proof.json").then((response) => response.ok ? response.json() : Promise.reject(new Error(`Live proof returned ${response.status}`))),
    ])
      .then(([demoValue, liveValue]: [DashboardData, LiveProof]) => { setDemo(demoValue); setLive(liveValue); setReport(liveValue.report); })
      .catch((error: Error) => setLoadError(error.message));
    const onPopState = () => setView(viewFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (next: View) => {
    const path = next === "run" ? "/run/fastapi-32673679212" : `/${next}`;
    window.history.pushState({}, "", path);
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const content = useMemo(() => {
    if (!demo || !live || !report) return null;
    if (view === "insights") return <Insights demo={demo} />;
    if (view === "methodology") return <Methodology demo={demo} />;
    return <CurrentFailure demo={demo} live={live} report={report} onReport={setReport} />;
  }, [demo, live, report, view]);

  if (loadError) return <div className="load-state"><strong>CISignal could not load its demo artifact.</strong><p>{loadError}</p></div>;
  if (!content) return <div className="load-state"><span className="loader" /><strong>Loading cited evidence…</strong></div>;
  return <AppShell view={view} navigate={navigate}>{content}</AppShell>;
}
