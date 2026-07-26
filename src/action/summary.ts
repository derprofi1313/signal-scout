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

const ACTION_SUMMARY_MAX_BYTES = 900 * 1024;
const MAX_SOURCE_NAME_BYTES = 1_900;
const MAX_METADATA_CELL_BYTES = 500;
const TRUNCATION_MARKER = "…";
const INVISIBLE_TEXT_BREAK = "&#8203;";
const omissionNoticeSuffix = " source rows were omitted to keep this summary bounded.";

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

function plainTextToken(character: string): string {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return "";
  }

  const isAsciiLetter =
    (codePoint >= 65 && codePoint <= 90) || (codePoint >= 97 && codePoint <= 122);
  const isAsciiDigit = codePoint >= 48 && codePoint <= 57;
  return codePoint === 32 || isAsciiLetter || isAsciiDigit ? character : `&#${codePoint};`;
}

function tableCell(value: string, maxBytes = MAX_METADATA_CELL_BYTES): string {
  const normalized = value
    .replace(unsafeRenderedCharacterPattern, visibleCharacterEscape)
    .replace(/[\u2028\u2029]/gu, " ")
    .trim();
  const tokens: string[] = [];
  let previousCharacterWasNonSpace = false;
  for (const character of normalized) {
    const token = plainTextToken(character);
    const isSpace = character === " ";
    tokens.push(
      previousCharacterWasNonSpace && !isSpace ? `${INVISIBLE_TEXT_BREAK}${token}` : token,
    );
    previousCharacterWasNonSpace = !isSpace;
  }
  const rendered = tokens.join("");
  if (Buffer.byteLength(rendered, "utf8") <= maxBytes) {
    return rendered;
  }

  const contentBudget = maxBytes - Buffer.byteLength(TRUNCATION_MARKER, "utf8");
  let renderedBytes = 0;
  let truncated = "";
  for (const token of tokens) {
    const tokenBytes = Buffer.byteLength(token, "utf8");
    if (renderedBytes + tokenBytes > contentBudget) {
      break;
    }
    truncated += token;
    renderedBytes += tokenBytes;
  }

  return `${truncated}${TRUNCATION_MARKER}`;
}

function renderTableRow(packet: EvidencePacket): string {
  const fields = [
    tableCell(packet.source.name, MAX_SOURCE_NAME_BYTES),
    tableCell(packet.status),
    tableCell(String(packet.summary.totalChanges)),
    tableCell(highestPacketPriority(packet)),
    tableCell(packet.id),
  ];
  return `| ${fields.join(" | ")} |`;
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
  const lines = [
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
  ];
  let renderedBytes = Buffer.byteLength(lines.join("\n"), "utf8");
  const omissionNoticeBytes = Buffer.byteLength(
    `\n\n> ${Number.MAX_SAFE_INTEGER}${omissionNoticeSuffix}\n`,
    "utf8",
  );
  let renderedPacketCount = 0;

  for (const packet of run.packets) {
    const row = renderTableRow(packet);
    const rowBytes = Buffer.byteLength(row, "utf8") + 1;
    if (renderedBytes + rowBytes + omissionNoticeBytes > ACTION_SUMMARY_MAX_BYTES) {
      break;
    }
    lines.push(row);
    renderedBytes += rowBytes;
    renderedPacketCount += 1;
  }

  if (renderedPacketCount < run.packets.length) {
    lines.push("", `> ${run.packets.length - renderedPacketCount}${omissionNoticeSuffix}`);
  }

  return `${lines.join("\n")}\n`;
}
