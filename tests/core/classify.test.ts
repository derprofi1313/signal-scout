import { describe, expect, it } from "vitest";

import { classifyFragment } from "@/core/classify";
import { buildEvidencePacket } from "@/core/packet";
import type {
  CapturedDocument,
  ClassifiedChange,
  DiffFragment,
  SignalScoutSource,
  SourceKind,
} from "@/core/types";

function classify(before: string[], after: string[], kind: SourceKind = "pricing") {
  const fragment: DiffFragment = {
    before,
    after,
    beforeStart: 0,
    afterStart: 0,
  };
  return classifyFragment(fragment, kind);
}

describe("explainable change classification", () => {
  it("marks a published price replacement as high-priority pricing evidence", () => {
    expect(classify(["$29 per workspace / month"], ["$39 per workspace / month"])).toMatchObject({
      category: "pricing",
      priority: "high",
      score: 90,
      reasons: ["Published price changed"],
    });
  });

  it("marks a plan-name replacement as high-priority packaging evidence", () => {
    expect(classify(["Starter"], ["Launch"])).toMatchObject({
      category: "packaging",
      priority: "high",
      score: 80,
      reasons: ["Plan or package name changed"],
    });
  });

  it("marks a new changelog feature as medium-priority product evidence", () => {
    expect(classify([], ["Added shared team workspaces"], "changelog")).toMatchObject({
      category: "product",
      priority: "medium",
      score: 60,
      reasons: ["Product or feature update published"],
    });
  });

  it("uses a low-priority general fallback for generic copy", () => {
    expect(classify(["Built with care"], ["Made with care"], "general")).toMatchObject({
      category: "general",
      priority: "low",
      score: 25,
      reasons: ["General page copy changed"],
    });
  });
});

const source: SignalScoutSource = {
  id: "demo-pricing",
  name: "Demo pricing fixture",
  url: "https://example.com/pricing",
  kind: "pricing",
  ignoreSelectors: [],
};

const previous: CapturedDocument = {
  raw: "<h1>Old pricing</h1>",
  normalized: {
    canonicalUrl: "https://fixture.invalid/pricing",
    lines: ["Pricing", "Launch", "$29 per workspace / month"],
    limitations: [],
  },
  metadata: {
    capturedAt: "2026-07-24T12:00:00.000Z",
    requestedUrl: "https://example.com/pricing",
    finalUrl: "https://fixture.invalid/pricing",
    statusCode: 200,
    contentType: "text/html",
    bytes: 20,
  },
};

const current: CapturedDocument = {
  raw: "<h1>Pricing</h1>",
  normalized: {
    canonicalUrl: "https://fixture.invalid/pricing",
    lines: ["Pricing", "Launch", "$39 per workspace / month"],
    limitations: [],
  },
  metadata: {
    capturedAt: "2026-07-25T12:00:00.000Z",
    requestedUrl: "https://example.com/pricing",
    finalUrl: "https://fixture.invalid/pricing",
    statusCode: 200,
    contentType: "text/html",
    bytes: 16,
  },
};

describe("evidence packet integrity", () => {
  it("builds deterministic hashes, ids, ordering, and summary counts", () => {
    const changes: ClassifiedChange[] = [
      {
        before: ["Old footer"],
        after: ["New footer"],
        beforeStart: 8,
        afterStart: 8,
        category: "general",
        priority: "low",
        score: 25,
        reasons: ["General page copy changed"],
      },
      {
        before: ["$29 per workspace / month"],
        after: ["$39 per workspace / month"],
        beforeStart: 2,
        afterStart: 2,
        category: "pricing",
        priority: "high",
        score: 90,
        reasons: ["Published price changed"],
      },
    ];

    const packet = buildEvidencePacket({ source, previous, current, changes });
    const rerun = buildEvidencePacket({ source, previous, current, changes });

    expect(packet).toEqual(rerun);
    expect(packet.schema).toBe("signal-scout/evidence@1");
    expect(packet.id).toBe("demo-pricing-97af8c0fbbf3");
    expect(packet.status).toBe("changed");
    expect(packet.hashes).toEqual({
      previous: {
        raw: "ff191b97935c088b511a702144b26c0738380d8b284640e30e2e312fdeb94854",
        normalized: "510842ff286ff845bd3462acdc9e08fd579ebcac5d8f6138cb3bd35307812de6",
      },
      current: {
        raw: "831b11072d4d297b3bd2880723412a7408fd9b544a535d07b116d69abfe8c9ef",
        normalized: "97af8c0fbbf332d59c66bc945af0541ad8f85063b3ce228f8ca5f43f09039cc7",
      },
    });
    expect(packet.changes.map((change) => change.category)).toEqual(["pricing", "general"]);
    expect(packet.summary).toEqual({
      totalChanges: 2,
      addedLines: 2,
      removedLines: 2,
      categories: {
        pricing: 1,
        packaging: 0,
        product: 0,
        positioning: 0,
        policy: 0,
        general: 1,
      },
      priorities: {
        low: 1,
        medium: 0,
        high: 1,
      },
    });
  });

  it("derives baseline and no-change statuses from capture history", () => {
    expect(buildEvidencePacket({ source, current }).status).toBe("baseline");
    expect(buildEvidencePacket({ source, previous: current, current }).status).toBe("no_change");
  });
});
