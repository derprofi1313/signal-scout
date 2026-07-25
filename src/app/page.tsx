import Link from "next/link";
import { ChainOfEvidence } from "@/components/chain-of-evidence";
import { demoPacket } from "@/data/demo-packet";

const heroChange = demoPacket.changes.find((change) => change.category === "pricing");
const currentCapture = demoPacket.captures.current;
const currentHashes = demoPacket.hashes.current;

if (!heroChange?.before[0] || !heroChange.after[0] || !currentCapture || !currentHashes) {
  throw new Error("The checked synthetic fixture must contain current pricing evidence.");
}

const sourceUrl = new URL(demoPacket.source.canonicalUrl);
const captureDate = currentCapture.capturedAt.slice(0, 10);
const captureTime = currentCapture.capturedAt.slice(11, 16);
const priorityLabel = `${heroChange.priority.charAt(0).toUpperCase()}${heroChange.priority.slice(1)}`;

const heroEvidence = [
  {
    label: "Source",
    value: `${sourceUrl.hostname}${sourceUrl.pathname}`,
    detail: "Canonical public URL",
  },
  {
    label: "Capture",
    value: `${captureDate} · ${captureTime} UTC`,
    detail: "Bound to capture time",
  },
  {
    label: "Normalized",
    value: `sha256: ${currentHashes.normalized.slice(0, 4)}…${currentHashes.normalized.slice(-4)}`,
    detail: "Noise removed, hash retained",
  },
  {
    label: "Exact diff",
    value: `${heroChange.before[0]} → ${heroChange.after[0]}`,
    detail: "Source lines, not a summary",
  },
  {
    label: "Signal",
    value: `${priorityLabel} · ${heroChange.category}`,
    detail: heroChange.reasons[0] ?? "Deterministic classification",
    tone: "change" as const,
  },
];

const processSteps = [
  {
    title: "Capture",
    copy: "Fetch a public page within strict time, size, and content limits.",
  },
  {
    title: "Normalize",
    copy: "Remove configured noise while preserving the semantic lines that matter.",
  },
  {
    title: "Compare",
    copy: "Write exact before-and-after fragments with stable SHA-256 hashes.",
  },
  {
    title: "Review",
    copy: "Read the explicit rule, priority, and disclosed limitations in Git.",
  },
];

export default function Home() {
  return (
    <main id="main-content">
      <section className="hero" aria-labelledby="hero-title">
        <div className="shell evidence-grid hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">Git-native evidence CI</p>
            <h1 id="hero-title">
              <span>Markets move.</span>
              <span>Your evidence shouldn’t.</span>
            </h1>
            <p className="hero__lede">
              Track the competitor pages that matter. Keep every conclusion attached to its URL,
              capture time, hash, and exact changed lines.
            </p>
            <div className="hero__actions">
              <Link className="button button--primary" href="/demo">
                Inspect the evidence
                <span aria-hidden="true">↗</span>
              </Link>
              <div className="install-command">
                <span aria-hidden="true">$</span>
                <code>pnpm cli init</code>
              </div>
            </div>
          </div>

          <div className="hero__specimen">
            <ChainOfEvidence
              eyebrow="Synthetic fixture"
              title="One claim. Every supporting link."
              steps={heroEvidence}
              variant="compact"
            />
          </div>
        </div>
      </section>

      <section className="method-section" aria-labelledby="method-title">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Why evidence CI</p>
            <h2 id="method-title">The report is only as useful as the path back to proof.</h2>
          </div>
          <ol className="method-list">
            {processSteps.map((step, index) => (
              <li key={step.title}>
                <span className="method-list__index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="contract-section" aria-labelledby="contract-title">
        <div className="shell evidence-grid contract-section__grid">
          <div className="contract-panel">
            <p className="eyebrow">The local contract</p>
            <h2 id="contract-title">A reviewable artifact, without a hosted dependency.</h2>
            <p>
              Baselines and change packets stay local until you explicitly opt them into Git.
              Deterministic evidence works without an API key.
            </p>
            <section aria-label="Signal Scout command sequence">
              <pre>
                <code>
                  <span>pnpm cli init</span>
                  <span>pnpm cli scan</span>
                  <span>git add -f .signal-scout</span>
                  <span>git diff --cached -- .signal-scout</span>
                </code>
              </pre>
            </section>
          </div>

          <aside className="demo-callout" aria-labelledby="demo-callout-title">
            <p className="eyebrow">Transparent by design</p>
            <h2 id="demo-callout-title">Inspect the packet before you install.</h2>
            <p>
              The demo is clearly synthetic. It exposes both captures, both hashes, exact fragments,
              and every classification reason.
            </p>
            <Link className="text-link" href="/demo">
              Open the synthetic fixture
              <span aria-hidden="true">→</span>
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}
