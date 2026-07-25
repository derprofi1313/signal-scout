import type { Metadata } from "next";
import { ChainOfEvidence, type EvidenceStep } from "@/components/chain-of-evidence";
import { DemoExplorer } from "@/components/demo-explorer";
import type { CaptureMetadata, EvidenceHashes } from "@/core/types";
import { demoPacket } from "@/data/demo-packet";

export const metadata: Metadata = {
  title: "Transparent evidence demo",
  description:
    "Inspect a clearly labelled synthetic Signal Scout packet from source and capture metadata through exact changed lines and deterministic priority reasons.",
};

function shortHash(hash: string) {
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

function formatCaptureTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

interface CaptureCardProps {
  label: "Previous capture" | "Current capture";
  capture: CaptureMetadata;
  hashes: EvidenceHashes;
}

function CaptureCard({ label, capture, hashes }: CaptureCardProps) {
  return (
    <article className="capture-card">
      <div className="capture-card__title">
        <h3>{label}</h3>
        <span>HTTP {capture.statusCode}</span>
      </div>
      <dl>
        <div>
          <dt>Captured</dt>
          <dd>
            <time dateTime={capture.capturedAt}>{formatCaptureTime(capture.capturedAt)} UTC</time>
          </dd>
        </div>
        <div>
          <dt>Raw SHA-256</dt>
          <dd>
            <code title={hashes.raw} aria-label={`Full raw SHA-256: ${hashes.raw}`}>
              {shortHash(hashes.raw)}
            </code>
          </dd>
        </div>
        <div>
          <dt>Normalized SHA-256</dt>
          <dd>
            <code
              title={hashes.normalized}
              aria-label={`Full normalized SHA-256: ${hashes.normalized}`}
            >
              {shortHash(hashes.normalized)}
            </code>
          </dd>
        </div>
        <div>
          <dt>Response</dt>
          <dd>
            {capture.contentType} · {capture.bytes.toLocaleString("en-US")} bytes
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function DemoPage() {
  const previousCapture = demoPacket.captures.previous;
  const currentCapture = demoPacket.captures.current;
  const previousHashes = demoPacket.hashes.previous;
  const currentHashes = demoPacket.hashes.current;

  const chainSteps: EvidenceStep[] = [
    {
      label: "Source",
      value: demoPacket.source.canonicalUrl,
      detail: demoPacket.source.name,
    },
    {
      label: "Capture",
      value: formatCaptureTime(demoPacket.capturedAt),
      detail: "UTC, response metadata retained",
    },
    {
      label: "Normalized",
      value: currentHashes ? shortHash(currentHashes.normalized) : "Unavailable",
      detail: "Full SHA-256 exposed below",
      tone: "verified",
    },
    {
      label: "Exact diff",
      value: "$29 → $39",
      detail: "Both source lines preserved",
    },
    {
      label: "Signal",
      value: "High · pricing",
      detail: "Rule: published price changed",
      tone: "change",
    },
  ];

  return (
    <main id="main-content">
      <section className="demo-hero" aria-labelledby="demo-title">
        <div className="shell evidence-grid">
          <div className="demo-hero__intro">
            <p className="fixture-label">{demoPacket.fixture?.label ?? "Synthetic fixture"}</p>
            <h1 id="demo-title">A change you can trace all the way back.</h1>
            <p className="demo-hero__lede">
              This packet is intentionally synthetic. Its job is to expose the full evidence
              contract—not to imply live monitoring, customers, or outcomes.
            </p>
          </div>
          <aside className="packet-stamp" aria-label="Fixture packet summary">
            <div className="packet-stamp__status">
              <strong>{demoPacket.source.name}</strong>
              <span className="status-badge">{demoPacket.status}</span>
            </div>
            <dl>
              <div>
                <dt>Canonical source</dt>
                <dd>
                  <a href={demoPacket.source.canonicalUrl}>{demoPacket.source.canonicalUrl}</a>
                </dd>
              </div>
              <div>
                <dt>Packet ID</dt>
                <dd>
                  <code>{demoPacket.id}</code>
                </dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd>
                  <code>{demoPacket.schema}</code>
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section className="packet-section" aria-labelledby="chain-title">
        <div className="shell">
          <ChainOfEvidence
            eyebrow="Provenance rail"
            title="Every conclusion stays attached to its proof."
            steps={chainSteps}
          />

          {previousCapture && currentCapture && previousHashes && currentHashes ? (
            <div className="capture-grid" aria-label="Capture and hash comparison">
              <CaptureCard
                label="Previous capture"
                capture={previousCapture}
                hashes={previousHashes}
              />
              <CaptureCard
                label="Current capture"
                capture={currentCapture}
                hashes={currentHashes}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="packet-section" aria-labelledby="changes-title">
        <div className="shell">
          <div className="packet-section__heading">
            <div>
              <p className="eyebrow">Exact fragments</p>
              <h2 id="changes-title">Two changes. No interpretive fog.</h2>
            </div>
            <p>
              Filter the synthetic packet by deterministic category. Each record keeps textual
              removal and addition markers, its priority, score, and rule reason.
            </p>
          </div>
          <DemoExplorer packet={demoPacket} />
        </div>
      </section>

      <section className="packet-section" aria-label="Packet notes">
        <div className="shell packet-notes">
          <article className="packet-note">
            <h2>Disclosed limitation</h2>
            <ul>
              {demoPacket.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </article>
          <article className="packet-note">
            <h2>What this packet does not claim</h2>
            <p>
              It does not infer business impact, predict intent, or imply statistical certainty. The
              score is an explainable deterministic rule output.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
