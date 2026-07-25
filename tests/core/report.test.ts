import { describe, expect, it } from "vitest";

import { renderMarkdown } from "@/core/report";
import type { EvidencePacket } from "@/core/types";

const packet: EvidencePacket = {
  schema: "signal-scout/evidence@1",
  id: "demo-pricing-bbbbbbbbbbbb",
  status: "changed",
  capturedAt: "2026-07-25T12:00:00.000Z",
  source: {
    id: "demo-pricing",
    name: "Demo pricing fixture",
    kind: "pricing",
    url: "https://example.com/pricing",
    canonicalUrl: "https://fixture.invalid/pricing",
  },
  captures: {
    previous: {
      capturedAt: "2026-07-24T12:00:00.000Z",
      requestedUrl: "https://example.com/pricing",
      finalUrl: "https://fixture.invalid/pricing",
      statusCode: 200,
      contentType: "text/html",
      bytes: 120,
    },
    current: {
      capturedAt: "2026-07-25T12:00:00.000Z",
      requestedUrl: "https://example.com/pricing",
      finalUrl: "https://fixture.invalid/pricing",
      statusCode: 200,
      contentType: "text/html",
      bytes: 124,
    },
  },
  hashes: {
    previous: {
      raw: "a".repeat(64),
      normalized: "1".repeat(64),
    },
    current: {
      raw: "b".repeat(64),
      normalized: "2".repeat(64),
    },
  },
  changes: [
    {
      before: ["$29 per workspace / month", "drop ``` fence"],
      after: ["$39 per workspace / month"],
      beforeStart: 2,
      afterStart: 2,
      category: "pricing",
      priority: "high",
      score: 90,
      reasons: ["Published price changed"],
    },
  ],
  summary: {
    totalChanges: 1,
    addedLines: 1,
    removedLines: 2,
    categories: {
      pricing: 1,
      packaging: 0,
      product: 0,
      positioning: 0,
      policy: 0,
      general: 0,
    },
    priorities: {
      low: 0,
      medium: 0,
      high: 1,
    },
  },
  limitations: ["Client-rendered content is not captured."],
  fixture: {
    synthetic: true,
    label: "Synthetic fixture",
  },
};

describe("Markdown evidence report", () => {
  it("renders the complete human-readable trust contract", () => {
    const markdown = renderMarkdown(packet);

    expect(markdown).toContain("# Signal Scout evidence: Demo pricing fixture");
    expect(markdown).toContain("**Schema:** `signal-scout/evidence@1`");
    expect(markdown).toContain(
      "**Source:** [Demo pricing fixture](https://fixture.invalid/pricing)",
    );
    expect(markdown).toContain("**Previous capture:** `2026-07-24T12:00:00.000Z`");
    expect(markdown).toContain("**Current capture:** `2026-07-25T12:00:00.000Z`");
    expect(markdown).toContain(`**Previous normalized SHA-256:** \`${"1".repeat(64)}\``);
    expect(markdown).toContain(`**Current normalized SHA-256:** \`${"2".repeat(64)}\``);
    expect(markdown).toContain("**Status:** `changed`");
    expect(markdown).toContain("**Priority:** High (90/100)");
    expect(markdown).toContain("**Reason:** Published price changed");
    expect(markdown).toContain("```text\n$29 per workspace / month\ndrop \\`\\`\\` fence\n```");
    expect(markdown).toContain("```text\n$39 per workspace / month\n```");
    expect(markdown).toContain("- Client-rendered content is not captured.");
    expect(markdown).toContain("This report is deterministic evidence, not strategic advice.");
  });

  it("renders explicit empty states for baselines without changes or limitations", () => {
    const markdown = renderMarkdown({
      ...packet,
      status: "baseline",
      changes: [],
      limitations: [],
      summary: {
        ...packet.summary,
        totalChanges: 0,
        addedLines: 0,
        removedLines: 0,
      },
    });

    expect(markdown).toContain("No semantic changes were recorded for this capture.");
    expect(markdown).toContain("- None disclosed.");
  });

  it("renders terminal controls visibly and encodes raw HTML from untrusted fields", () => {
    const unsafePacket = structuredClone(packet);
    unsafePacket.source.name = "<script>alert(1)</script>\u001b]52;c;clipboard\u0007";
    unsafePacket.changes[0]!.before = [
      "$29 per workspace / month\u001b]52;c;clipboard\u0007",
      "\u009b31mred",
    ];
    unsafePacket.limitations = ["<img src=x onerror=alert(1)>\u202e"];

    const markdown = renderMarkdown(unsafePacket);

    for (const unsafeCharacter of ["\u0007", "\u001b", "\u009b", "\u202e"]) {
      expect(markdown).not.toContain(unsafeCharacter);
    }
    expect(markdown).not.toContain("<script>");
    expect(markdown).not.toContain("<img");
    expect(markdown).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markdown).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(markdown).toContain("\\u001b]52;c;clipboard\\u0007");
    expect(markdown).toContain("\\u009b31mred");
    expect(markdown).toContain("\\u202e");
  });
});
