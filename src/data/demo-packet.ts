import { parseEvidencePacket } from "@/core/evidence-schema";
import { EVIDENCE_SCHEMA_ID, type EvidencePacket } from "@/core/types";

const demoPacketFixture: EvidencePacket = {
  schema: EVIDENCE_SCHEMA_ID,
  id: "demo-pricing-b0c26114676d",
  status: "changed",
  capturedAt: "2026-07-25T09:12:24.000Z",
  source: {
    id: "demo-pricing",
    name: "Demo pricing fixture",
    kind: "pricing",
    url: "https://fixture.invalid/pricing",
    canonicalUrl: "https://fixture.invalid/pricing",
  },
  captures: {
    previous: {
      capturedAt: "2026-07-18T09:12:04.000Z",
      requestedUrl: "https://fixture.invalid/pricing",
      finalUrl: "https://fixture.invalid/pricing",
      statusCode: 200,
      contentType: "text/html",
      bytes: 869,
    },
    current: {
      capturedAt: "2026-07-25T09:12:24.000Z",
      requestedUrl: "https://fixture.invalid/pricing",
      finalUrl: "https://fixture.invalid/pricing",
      statusCode: 200,
      contentType: "text/html",
      bytes: 697,
    },
  },
  hashes: {
    previous: {
      raw: "32368e53d7e1bcc34569b91f72ab4e8087948557dd9e59074dcedd55ac51de8c",
      normalized: "71b1b731fb4eb150f48bad269d73f5e226fc4acf85a070d97df94a41b24dc144",
    },
    current: {
      raw: "a9eeebf5b080cc195f05509f3b9687b8044486df1fb0ec5215eb7569401eeb66",
      normalized: "b0c26114676d0b462087c93dc46ab23341d1ffdc84013fd308b163a733583cad",
    },
  },
  changes: [
    {
      before: ["$29 per workspace / month", "5 projects"],
      after: ["$39 per workspace / month", "10 projects"],
      beforeStart: 2,
      afterStart: 2,
      category: "pricing",
      priority: "high",
      score: 90,
      reasons: ["Published price changed"],
    },
    {
      before: [],
      after: ["API access"],
      beforeStart: 5,
      afterStart: 5,
      context: {
        before: ["5 projects", "Email support"],
        after: ["10 projects", "Email support", "API access"],
      },
      category: "product",
      priority: "medium",
      score: 60,
      reasons: ["Product or feature update published"],
    },
  ],
  summary: {
    totalChanges: 2,
    addedLines: 3,
    removedLines: 2,
    categories: {
      pricing: 1,
      packaging: 0,
      product: 1,
      positioning: 0,
      policy: 0,
      general: 0,
    },
    priorities: {
      low: 0,
      medium: 1,
      high: 1,
    },
  },
  limitations: [
    "This synthetic fixture contains static HTML; it does not exercise JavaScript-rendered capture.",
  ],
  fixture: {
    synthetic: true,
    label: "Synthetic fixture",
  },
};

export const demoPacket = parseEvidencePacket(demoPacketFixture);
