import type { ClassifiedChange } from "@/core/types";

interface DiffFragmentProps {
  change: ClassifiedChange;
}

interface DiffColumnProps {
  label: "Before" | "After";
  marker: "−" | "+";
  action: "Removal" | "Addition";
  lines: string[];
  variant: "before" | "after";
}

function DiffColumn({ label, marker, action, lines, variant }: DiffColumnProps) {
  return (
    <section className={`diff-column diff-column--${variant}`} aria-label={`${label} fragment`}>
      <div className="diff-column__heading">
        <h4>{label}</h4>
        <span>{action}</span>
      </div>
      {lines.length > 0 ? (
        <ul className="diff-lines">
          {lines.map((line, index) => (
            // Duplicate evidence lines are valid; their immutable position distinguishes them.
            // biome-ignore lint/suspicious/noArrayIndexKey: stateless exact-diff rows have no stable external id
            <li key={`${line}-${index}`}>
              <span className="diff-marker" aria-hidden="true">
                {marker}
              </span>
              <span>
                <span className="sr-only">{action} line: </span>
                <code>{line}</code>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="diff-empty">No {action.toLowerCase()} lines.</p>
      )}
    </section>
  );
}

export function DiffFragment({ change }: DiffFragmentProps) {
  const context = change.context?.after[0] ?? change.context?.before[0];

  return (
    <div>
      <div className="diff-grid">
        <DiffColumn
          label="Before"
          marker="−"
          action="Removal"
          lines={change.before}
          variant="before"
        />
        <DiffColumn
          label="After"
          marker="+"
          action="Addition"
          lines={change.after}
          variant="after"
        />
      </div>
      {context ? (
        <p className="diff-context">
          <strong>Bounded context</strong>
          <code>{context}</code>
        </p>
      ) : null}
    </div>
  );
}
