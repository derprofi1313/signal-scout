import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { normalizeHtml } from "@/core/normalize";
import { demoPacket } from "@/data/demo-packet";

const fixtureOptions = {
  sourceUrl: "https://fixture.invalid/pricing",
  ignoreSelectors: ["[data-volatile]", ".cookie-banner"],
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalFixtureText(value: string): string {
  return value.replaceAll("\r\n", "\n");
}

describe("synthetic demo evidence", () => {
  it("keeps its hashes and fragments tied to the shipped fixture captures", async () => {
    const [beforeInput, afterInput] = await Promise.all([
      readFile("tests/fixtures/demo-before.html", "utf8"),
      readFile("tests/fixtures/demo-after.html", "utf8"),
    ]);
    const beforeRaw = canonicalFixtureText(beforeInput);
    const afterRaw = canonicalFixtureText(afterInput);
    const before = normalizeHtml(beforeRaw, fixtureOptions);
    const after = normalizeHtml(afterRaw, fixtureOptions);

    expect(before.lines).toEqual([
      "Pricing",
      "Launch",
      "$29 per workspace / month",
      "5 projects",
      "Email support",
    ]);
    expect(after.lines).toEqual([
      "Pricing",
      "Launch",
      "$39 per workspace / month",
      "10 projects",
      "Email support",
      "API access",
    ]);
    expect(demoPacket.hashes).toEqual({
      previous: {
        raw: sha256(beforeRaw),
        normalized: sha256(before.lines.join("\n")),
      },
      current: {
        raw: sha256(afterRaw),
        normalized: sha256(after.lines.join("\n")),
      },
    });
    expect(demoPacket.changes).toEqual([
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
    ]);
    expect(demoPacket.summary).toEqual({
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
    });
  });
});
