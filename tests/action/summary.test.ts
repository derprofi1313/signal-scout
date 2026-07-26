import { describe, expect, it } from "vitest";

import { actionOutputEntries, renderActionSummary, summarizeRun } from "@/action/summary";
import { demoPacket } from "@/data/demo-packet";
import type { EvidencePacket, ScanRun } from "@/core/types";

function packet(status: EvidencePacket["status"]): EvidencePacket {
  const result = structuredClone(demoPacket);
  result.status = status;
  result.changes = [];
  result.summary = {
    ...result.summary,
    totalChanges: 0,
    addedLines: 0,
    removedLines: 0,
    categories: {
      pricing: 0,
      packaging: 0,
      product: 0,
      positioning: 0,
      policy: 0,
      general: 0,
    },
    priorities: {
      low: 0,
      medium: 0,
      high: 0,
    },
  };
  return result;
}

describe("action scan summaries", () => {
  it("aggregates packet statuses and high-priority changes", () => {
    const changed = packet("changed");
    changed.changes = [
      { ...demoPacket.changes[0]!, priority: "low" },
      { ...demoPacket.changes[0]!, priority: "high" },
      { ...demoPacket.changes[0]!, priority: "high" },
    ];
    changed.summary = {
      ...changed.summary,
      totalChanges: 3,
      addedLines: 3,
      removedLines: 3,
      categories: {
        pricing: 3,
        packaging: 0,
        product: 0,
        positioning: 0,
        policy: 0,
        general: 0,
      },
      priorities: { low: 1, medium: 0, high: 2 },
    };

    const run: ScanRun = {
      packets: [packet("baseline"), packet("no_change"), changed, packet("failed")],
      succeeded: 3,
      failed: 1,
    };

    expect(summarizeRun(run)).toEqual({
      baselineCount: 1,
      noChangeCount: 1,
      changedCount: 1,
      failedCount: 1,
      highPriorityChangeCount: 2,
      hasChanges: true,
      highestPriority: "high",
    });
  });

  it("serializes all GitHub Action outputs as literal strings", () => {
    expect(
      actionOutputEntries({
        baselineCount: 1,
        noChangeCount: 1,
        changedCount: 1,
        failedCount: 1,
        highPriorityChangeCount: 2,
        hasChanges: true,
        highestPriority: "high",
      }),
    ).toEqual([
      ["baseline-count", "1"],
      ["no-change-count", "1"],
      ["changed-count", "1"],
      ["failed-count", "1"],
      ["high-priority-change-count", "2"],
      ["has-changes", "true"],
      ["highest-priority", "high"],
    ]);
  });

  it("renders bounded metadata rows without unsafe source content or evidence fragments", () => {
    const packets = [
      packet("baseline"),
      packet("no_change"),
      packet("changed"),
      packet("failed"),
    ].map((currentPacket, index) => ({
      ...currentPacket,
      id: `packet-${index + 1}`,
    }));
    packets[2]!.source.name = "Pricing \\ | <script>\n\u202E\u0001 source";
    packets[2]!.changes = [
      {
        ...demoPacket.changes[0]!,
        before: ["PRIVATE BEFORE EVIDENCE"],
        after: ["PRIVATE AFTER EVIDENCE"],
      },
    ];
    packets[2]!.summary = {
      ...packets[2]!.summary,
      totalChanges: 1,
      priorities: { low: 0, medium: 0, high: 1 },
    };
    const run: ScanRun = { packets, succeeded: 3, failed: 1 };

    const rendered = renderActionSummary(run, summarizeRun(run));

    const tableRows = rendered
      .split("\n")
      .filter((line) => line.startsWith("| "))
      .slice(2);
    expect(tableRows).toHaveLength(run.packets.length);
    expect(rendered).toContain("\\\\");
    expect(rendered).toContain("\\|");
    expect(rendered).toContain("&lt;script&gt;");
    expect(rendered).not.toContain("<script>");
    expect(rendered).not.toContain("\u202E");
    expect(rendered).not.toContain("\u0001");
    expect(rendered).not.toContain("PRIVATE BEFORE EVIDENCE");
    expect(rendered).not.toContain("PRIVATE AFTER EVIDENCE");
  });
});
