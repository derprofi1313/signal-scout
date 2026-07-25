"use client";

import { useState } from "react";
import type { ChangeCategory, EvidencePacket } from "@/core/types";
import { DiffFragment } from "@/components/diff-fragment";

type DemoFilter = "all" | Extract<ChangeCategory, "pricing" | "packaging" | "product">;

const filters: Array<{ value: DemoFilter; label: string }> = [
  { value: "all", label: "All changes" },
  { value: "pricing", label: "Pricing" },
  { value: "packaging", label: "Packaging" },
  { value: "product", label: "Product" },
];

interface DemoExplorerProps {
  packet: EvidencePacket;
}

export function DemoExplorer({ packet }: DemoExplorerProps) {
  const [filter, setFilter] = useState<DemoFilter>("all");
  const visibleChanges =
    filter === "all"
      ? packet.changes
      : packet.changes.filter((change) => change.category === filter);

  return (
    <div>
      <fieldset className="filter-bar">
        <legend className="sr-only">Filter evidence changes</legend>
        {filters.map((option) => (
          <button
            className="filter-button"
            type="button"
            aria-controls="evidence-changes"
            aria-pressed={filter === option.value}
            key={option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </fieldset>

      <p className="sr-only" aria-live="polite">
        Showing {visibleChanges.length} of {packet.changes.length} fixture changes.
      </p>

      <div className="change-list" id="evidence-changes">
        {visibleChanges.length > 0 ? (
          visibleChanges.map((change) => {
            const reason = change.reasons[0] ?? "Deterministic change";
            return (
              <article
                className="change-card"
                key={`${change.category}-${change.beforeStart}-${change.afterStart}`}
              >
                <header className="change-card__header">
                  <div>
                    <div className="change-card__labels">
                      <span className="change-label">{change.category}</span>
                      <span className={`change-label change-label--priority-${change.priority}`}>
                        {change.priority} priority
                      </span>
                    </div>
                    <h3>{reason}</h3>
                    {change.reasons.length > 1 ? (
                      <p>{change.reasons.slice(1).join(" · ")}</p>
                    ) : null}
                  </div>
                  <p className="change-score">
                    <span className="sr-only">Priority score </span>
                    <strong>{change.score}</strong>
                    <span aria-hidden="true">score</span>
                    <span className="sr-only"> out of 100</span>
                  </p>
                </header>
                <DiffFragment change={change} />
              </article>
            );
          })
        ) : (
          <div className="empty-filter" role="status">
            <h3>No {filter} changes in this fixture.</h3>
            <p>Select “All changes” to return to the complete evidence packet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
