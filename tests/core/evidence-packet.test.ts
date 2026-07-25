import { describe, expect, it } from "vitest";

import { evidencePacketSchema } from "@/core/evidence-schema";
import { demoPacket } from "@/data/demo-packet";

describe("evidence packet runtime schema", () => {
  it("accepts the complete synthetic fixture", () => {
    expect(evidencePacketSchema.safeParse(demoPacket)).toMatchObject({
      success: true,
    });
  });

  it("rejects unknown fields in nested packet objects", () => {
    const result = evidencePacketSchema.safeParse({
      ...demoPacket,
      source: {
        ...demoPacket.source,
        confidence: 0.9,
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("source");
    }
  });

  it("rejects summary category and priority counts that disagree with changes", () => {
    const result = evidencePacketSchema.safeParse({
      ...demoPacket,
      summary: {
        ...demoPacket.summary,
        categories: {
          ...demoPacket.summary.categories,
          pricing: 0,
        },
        priorities: {
          ...demoPacket.summary.priorities,
          high: 0,
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining(["summary.categories.pricing", "summary.priorities.high"]),
      );
    }
  });

  it.each([
    {
      name: "category",
      mutate: (packet: typeof demoPacket) => {
        packet.changes[0]!.category = "general";
        packet.summary.categories.pricing = 0;
        packet.summary.categories.general = 1;
      },
      path: "changes.0.category",
    },
    {
      name: "priority",
      mutate: (packet: typeof demoPacket) => {
        packet.changes[0]!.priority = "low";
        packet.summary.priorities.high = 0;
        packet.summary.priorities.low = 1;
      },
      path: "changes.0.priority",
    },
    {
      name: "score",
      mutate: (packet: typeof demoPacket) => {
        packet.changes[0]!.score = 25;
      },
      path: "changes.0.score",
    },
    {
      name: "reason",
      mutate: (packet: typeof demoPacket) => {
        packet.changes[0]!.reasons = ["Invented classifier explanation"];
      },
      path: "changes.0.reasons",
    },
  ])("rejects a forged deterministic classifier $name", ({ mutate, path }) => {
    const packet = structuredClone(demoPacket);
    mutate(packet);

    const result = evidencePacketSchema.safeParse(packet);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(path);
    }
  });

  it.each([
    {
      name: "a forged successful packet identifier",
      packet: {
        ...demoPacket,
        id: "demo-pricing-000000000000",
      },
    },
    {
      name: "a current capture requested from another source",
      packet: {
        ...demoPacket,
        captures: {
          ...demoPacket.captures,
          current: {
            ...demoPacket.captures.current!,
            requestedUrl: "https://example.com/not-the-packet-source",
          },
        },
      },
    },
    {
      name: "a previous capture requested from another source",
      packet: {
        ...demoPacket,
        captures: {
          ...demoPacket.captures,
          previous: {
            ...demoPacket.captures.previous!,
            requestedUrl: "https://example.com/not-the-packet-source",
          },
        },
      },
    },
    {
      name: "changes outside deterministic packet order",
      packet: {
        ...demoPacket,
        changes: [...demoPacket.changes].reverse(),
      },
    },
  ])("rejects $name", ({ packet }) => {
    expect(evidencePacketSchema.safeParse(packet)).toMatchObject({
      success: false,
    });
  });

  it.each([
    {
      name: "a non-enum source kind",
      packet: {
        ...demoPacket,
        source: { ...demoPacket.source, kind: "blog" },
      },
    },
    {
      name: "a non-enum change category",
      packet: {
        ...demoPacket,
        changes: [{ ...demoPacket.changes[0]!, category: "revenue" }],
      },
    },
    {
      name: "an out-of-range change score",
      packet: {
        ...demoPacket,
        changes: [{ ...demoPacket.changes[0]!, score: 101 }, demoPacket.changes[1]!],
      },
    },
    {
      name: "a negative change position",
      packet: {
        ...demoPacket,
        changes: [{ ...demoPacket.changes[0]!, beforeStart: -1 }, demoPacket.changes[1]!],
      },
    },
    {
      name: "a change without a reason",
      packet: {
        ...demoPacket,
        changes: [{ ...demoPacket.changes[0]!, reasons: [] }, demoPacket.changes[1]!],
      },
    },
    {
      name: "an invalid nested capture timestamp",
      packet: {
        ...demoPacket,
        captures: {
          ...demoPacket.captures,
          current: { ...demoPacket.captures.current!, capturedAt: "today" },
        },
      },
    },
    {
      name: "an unsupported capture content type",
      packet: {
        ...demoPacket,
        captures: {
          ...demoPacket.captures,
          current: { ...demoPacket.captures.current!, contentType: "application/json" },
        },
      },
    },
    {
      name: "a capture without its matching hashes",
      packet: {
        ...demoPacket,
        hashes: { ...demoPacket.hashes, current: null },
      },
    },
    {
      name: "an invalid fixture declaration",
      packet: {
        ...demoPacket,
        fixture: { synthetic: false, label: "Demo fixture" },
      },
    },
  ])("rejects $name", ({ packet }) => {
    expect(evidencePacketSchema.safeParse(packet)).toMatchObject({
      success: false,
    });
  });
});
