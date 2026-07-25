import type { ClassifiedChange, EvidencePacket } from "./types";

function escapeMarkdownText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([[\]*_`#])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeLinkDestination(value: string): string {
  return value
    .replace(/\\/g, "%5C")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\s/g, "%20");
}

function escapeEvidenceLine(value: string): string {
  return value.replace(/`/g, "\\`");
}

function titleCase(value: string): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

function captureTime(value: string | undefined): string {
  return value ? `\`${value}\`` : "Not available";
}

function hashValue(value: string | undefined): string {
  return value ? `\`${value}\`` : "Not available";
}

function evidenceBlock(lines: readonly string[]): string {
  const content = lines.length > 0 ? lines.map(escapeEvidenceLine).join("\n") : "(none)";
  return `\`\`\`text\n${content}\n\`\`\``;
}

function renderChange(change: ClassifiedChange, index: number): string {
  const reasons = change.reasons.map((reason) => `- **Reason:** ${escapeMarkdownText(reason)}`);
  return [
    `### ${index + 1}. ${titleCase(change.category)} change`,
    "",
    `- **Category:** ${change.category}`,
    `- **Priority:** ${titleCase(change.priority)} (${change.score}/100)`,
    ...reasons,
    `- **Line positions:** before ${change.beforeStart}, after ${change.afterStart}`,
    "",
    "#### Before",
    "",
    evidenceBlock(change.before),
    "",
    "#### After",
    "",
    evidenceBlock(change.after),
  ].join("\n");
}

export function renderMarkdown(packet: EvidencePacket): string {
  const changes =
    packet.changes.length > 0
      ? packet.changes.map(renderChange).join("\n\n")
      : "No semantic changes were recorded for this capture.";
  const limitations =
    packet.limitations.length > 0
      ? packet.limitations.map((limitation) => `- ${escapeMarkdownText(limitation)}`).join("\n")
      : "- None disclosed.";

  return [
    `# Signal Scout evidence: ${escapeMarkdownText(packet.source.name)}`,
    "",
    packet.fixture?.synthetic ? `> ${packet.fixture.label}` : "",
    packet.fixture?.synthetic ? "" : "",
    `**Schema:** \`${packet.schema}\`  `,
    `**Packet ID:** \`${packet.id}\`  `,
    `**Status:** \`${packet.status}\`  `,
    `**Source:** [${escapeMarkdownText(packet.source.name)}](${escapeLinkDestination(packet.source.canonicalUrl)})`,
    "",
    "## Capture chain",
    "",
    `**Previous capture:** ${captureTime(packet.captures.previous?.capturedAt)}  `,
    `**Current capture:** ${captureTime(packet.captures.current?.capturedAt)}  `,
    `**Previous raw SHA-256:** ${hashValue(packet.hashes.previous?.raw)}  `,
    `**Current raw SHA-256:** ${hashValue(packet.hashes.current?.raw)}  `,
    `**Previous normalized SHA-256:** ${hashValue(packet.hashes.previous?.normalized)}  `,
    `**Current normalized SHA-256:** ${hashValue(packet.hashes.current?.normalized)}`,
    "",
    "## Summary",
    "",
    `- Changes: ${packet.summary.totalChanges}`,
    `- Added lines: ${packet.summary.addedLines}`,
    `- Removed lines: ${packet.summary.removedLines}`,
    ...(packet.error
      ? [
          `- Error code: \`${packet.error.code}\``,
          `- Error: ${escapeMarkdownText(packet.error.message)}`,
        ]
      : []),
    "",
    "## Changes",
    "",
    changes,
    "",
    "## Limitations",
    "",
    limitations,
    "",
    "---",
    "",
    "This report is deterministic evidence, not strategic advice.",
    "",
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");
}
