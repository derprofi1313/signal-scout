type EvidenceTone = "neutral" | "verified" | "change";

export interface EvidenceStep {
  label: string;
  value: string;
  detail: string;
  tone?: EvidenceTone;
}

interface ChainOfEvidenceProps {
  eyebrow: string;
  title: string;
  steps: EvidenceStep[];
  variant?: "compact" | "detail";
}

export function ChainOfEvidence({
  eyebrow,
  title,
  steps,
  variant = "detail",
}: ChainOfEvidenceProps) {
  return (
    <section className={`evidence-chain evidence-chain--${variant}`} aria-label="Chain of evidence">
      <header className="evidence-chain__header">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </header>
      <div className="evidence-chain__rail">
        <span className="chain-marker" data-chain-marker aria-hidden="true" />
        <ol>
          {steps.map((step, index) => (
            <li
              className={`evidence-chain__step evidence-chain__step--${step.tone ?? "neutral"}`}
              key={`${step.label}-${step.value}`}
            >
              <span className="evidence-chain__node" aria-hidden="true">
                {index + 1}
              </span>
              <p className="evidence-chain__label">{step.label}</p>
              <p className="evidence-chain__value">{step.value}</p>
              <p className="evidence-chain__detail">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
