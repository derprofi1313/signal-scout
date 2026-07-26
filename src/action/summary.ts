import type { EvidencePacket, Priority, ScanRun } from "@/core/types";

export type HighestPriority = Priority | "none";

export interface ActionRunSummary {
  baselineCount: number;
  noChangeCount: number;
  changedCount: number;
  failedCount: number;
  highPriorityChangeCount: number;
  hasChanges: boolean;
  highestPriority: HighestPriority;
}

const priorityOrder: Readonly<Record<HighestPriority, number>> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function highestPacketPriority(packet: EvidencePacket): HighestPriority {
  let highestPriority: HighestPriority = "none";

  for (const change of packet.changes) {
    if (priorityOrder[change.priority] > priorityOrder[highestPriority]) {
      highestPriority = change.priority;
    }
  }

  return highestPriority;
}

export function summarizeRun(run: ScanRun): ActionRunSummary {
  let baselineCount = 0;
  let noChangeCount = 0;
  let changedCount = 0;
  let failedCount = 0;
  let highPriorityChangeCount = 0;
  let highestPriority: HighestPriority = "none";

  for (const packet of run.packets) {
    switch (packet.status) {
      case "baseline":
        baselineCount += 1;
        break;
      case "no_change":
        noChangeCount += 1;
        break;
      case "changed":
        changedCount += 1;
        break;
      case "failed":
        failedCount += 1;
        break;
    }

    for (const change of packet.changes) {
      if (change.priority === "high") {
        highPriorityChangeCount += 1;
      }
      if (priorityOrder[change.priority] > priorityOrder[highestPriority]) {
        highestPriority = change.priority;
      }
    }
  }

  return {
    baselineCount,
    noChangeCount,
    changedCount,
    failedCount,
    highPriorityChangeCount,
    hasChanges: changedCount > 0,
    highestPriority,
  };
}

// biome-ignore lint/complexity/useRegexLiterals: the constructor keeps unsafe code points escaped in source
const unsafeRenderedCharacterPattern = new RegExp(
  "[\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]",
  "gu",
);

function visibleCharacterEscape(value: string): string {
  const codePoint = value.codePointAt(0);
  return codePoint === undefined ? "" : `\\u${codePoint.toString(16).padStart(4, "0")}`;
}

function escapeTableCell(value: string): string {
  return value
    .replace(unsafeRenderedCharacterPattern, visibleCharacterEscape)
    .replace(/[\u2028\u2029]/gu, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .trim();
}

export function actionOutputEntries(summary: ActionRunSummary): readonly [string, string][] {
  return [
    ["baseline-count", String(summary.baselineCount)],
    ["no-change-count", String(summary.noChangeCount)],
    ["changed-count", String(summary.changedCount)],
    ["failed-count", String(summary.failedCount)],
    ["high-priority-change-count", String(summary.highPriorityChangeCount)],
    ["has-changes", String(summary.hasChanges)],
    ["highest-priority", summary.highestPriority],
  ];
}

export function renderActionSummary(run: ScanRun, summary: ActionRunSummary): string {
  const rows = run.packets.map((packet) => {
    const fields = [
      packet.source.name,
      packet.status,
      String(packet.summary.totalChanges),
      highestPacketPriority(packet),
      packet.id,
    ];
    return `| ${fields.map(escapeTableCell).join(" | ")} |`;
  });

  return [
    "## Signal Scout scan summary",
    "",
    `- Baselines: ${summary.baselineCount}`,
    `- No changes: ${summary.noChangeCount}`,
    `- Changed: ${summary.changedCount}`,
    `- Failed: ${summary.failedCount}`,
    `- High-priority changes: ${summary.highPriorityChangeCount}`,
    `- Highest priority: ${summary.highestPriority}`,
    "",
    "| Source | Status | Changes | Highest priority | Packet ID |",
    "| --- | --- | ---: | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
