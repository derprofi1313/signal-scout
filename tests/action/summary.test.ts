import { describe, expect, it } from "vitest";

import { actionOutputEntries, renderActionSummary, summarizeRun } from "@/action/summary";
import { demoPacket } from "@/data/demo-packet";
import type { EvidencePacket, ScanRun } from "@/core/types";

const INVISIBLE_TEXT_BREAK = "&#8203;";

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
    const renderedWithoutTextBreaks = rendered.replaceAll(INVISIBLE_TEXT_BREAK, "");
    expect(tableRows).toHaveLength(run.packets.length);
    expect(renderedWithoutTextBreaks).toContain("&#92;");
    expect(renderedWithoutTextBreaks).toContain("&#124;");
    expect(renderedWithoutTextBreaks).toContain("&#60;script&#62;");
    expect(rendered).not.toContain("<script>");
    expect(rendered).not.toContain("\u202E");
    expect(rendered).not.toContain("\u0001");
    expect(rendered).not.toContain("PRIVATE BEFORE EVIDENCE");
    expect(rendered).not.toContain("PRIVATE AFTER EVIDENCE");
  });

  it.each([
    {
      label: "image syntax",
      sourceName: "![roadmap](https://attacker.example/pixel.png)",
      renderedName:
        "&#33;&#91;roadmap&#93;&#40;https&#58;&#47;&#47;attacker&#46;example&#47;pixel&#46;png&#41;",
    },
    {
      label: "inline link syntax",
      sourceName: "[trusted](https://attacker.example)",
      renderedName: "&#91;trusted&#93;&#40;https&#58;&#47;&#47;attacker&#46;example&#41;",
    },
    {
      label: "bare HTTPS autolink",
      sourceName: "https://attacker.example",
      renderedName: "https&#58;&#47;&#47;attacker&#46;example",
    },
    {
      label: "www autolink",
      sourceName: "www.attacker.example",
      renderedName: "www&#46;attacker&#46;example",
    },
    {
      label: "email autolink",
      sourceName: "security@example.com",
      renderedName: "security&#64;example&#46;com",
    },
    {
      label: "emphasis syntax",
      sourceName: "*trusted* _trusted_",
      renderedName: "&#42;trusted&#42; &#95;trusted&#95;",
    },
    {
      label: "strikethrough syntax",
      sourceName: "~~trusted~~",
      renderedName: "&#126;&#126;trusted&#126;&#126;",
    },
    {
      label: "code span syntax",
      sourceName: "`trusted`",
      renderedName: "&#96;trusted&#96;",
    },
  ])("renders untrusted source $label as plain text", ({ sourceName, renderedName }) => {
    const currentPacket = packet("no_change");
    currentPacket.source.name = sourceName;
    const run: ScanRun = { packets: [currentPacket], succeeded: 1, failed: 0 };

    const rendered = renderActionSummary(run, summarizeRun(run));
    const dataRow = rendered
      .split("\n")
      .filter((line) => line.startsWith("| "))
      .at(-1);
    const sourceCell = dataRow?.slice(2).split(" | ", 1)[0];

    expect(sourceCell?.replaceAll(INVISIBLE_TEXT_BREAK, "")).toBe(renderedName);
    expect(sourceCell).toContain(INVISIBLE_TEXT_BREAK);
    expect(rendered).not.toContain(`| ${sourceName} |`);
  });

  it("preserves ordinary Unicode source names through numeric HTML entities", () => {
    const currentPacket = packet("no_change");
    currentPacket.source.name = "Grüße 東京 🚀";
    const run: ScanRun = { packets: [currentPacket], succeeded: 1, failed: 0 };

    const rendered = renderActionSummary(run, summarizeRun(run));
    const dataRow = rendered
      .split("\n")
      .filter((line) => line.startsWith("| "))
      .at(-1);
    const sourceCell = dataRow?.slice(2).split(" | ", 1)[0];

    expect(sourceCell?.replaceAll(INVISIBLE_TEXT_BREAK, "")).toBe(
      "Gr&#252;&#223;e &#26481;&#20140; &#128640;",
    );
    expect(sourceCell).toContain(INVISIBLE_TEXT_BREAK);
  });

  it("truncates encoded Unicode only between complete HTML entities", () => {
    const currentPacket = packet("no_change");
    currentPacket.source.name = "🚀".repeat(400);
    const run: ScanRun = { packets: [currentPacket], succeeded: 1, failed: 0 };

    const rendered = renderActionSummary(run, summarizeRun(run));
    const dataRow = rendered.split("\n").find((line) => line.startsWith("| &#128640;"));
    const sourceCell = dataRow?.slice(2).split(" | ", 1)[0];

    expect(sourceCell).toBeDefined();
    expect(Buffer.byteLength(sourceCell ?? "", "utf8")).toBeLessThanOrEqual(1_900);
    expect(sourceCell).toMatch(/^&#128640;(?:&#8203;&#128640;)+…$/u);
  });

  it("bounds an oversized untrusted scan with a deterministic omission notice", () => {
    const oversizedSourceName = "untrusted-source-".concat("x".repeat(16 * 1024));
    const packets = Array.from({ length: 500 }, (_, index) => {
      const currentPacket = packet("no_change");
      currentPacket.id = `packet-${index + 1}`;
      currentPacket.source.name = oversizedSourceName;
      return currentPacket;
    });
    const run: ScanRun = { packets, succeeded: packets.length, failed: 0 };

    const rendered = renderActionSummary(run, summarizeRun(run));
    const renderedWithoutTextBreaks = rendered.replaceAll(INVISIBLE_TEXT_BREAK, "");

    expect(Buffer.byteLength(rendered, "utf8")).toBeLessThan(1_024 * 1_024);
    expect(rendered).toContain("…");
    expect(renderedWithoutTextBreaks).toContain("packet&#45;1");
    expect(renderedWithoutTextBreaks).not.toContain("packet&#45;500");
    expect(rendered).toContain("source rows were omitted to keep this summary bounded.");
  });
});
