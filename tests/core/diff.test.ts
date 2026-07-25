import { describe, expect, it } from "vitest";

import { diffLines } from "@/core/diff";

describe("semantic line diff", () => {
  it("emits one exact fragment for a price replacement", () => {
    expect(
      diffLines(
        ["Pricing", "Launch", "$29 per workspace / month", "Email support"],
        ["Pricing", "Launch", "$39 per workspace / month", "Email support"],
      ),
    ).toEqual([
      {
        before: ["$29 per workspace / month"],
        after: ["$39 per workspace / month"],
        beforeStart: 2,
        afterStart: 2,
      },
    ]);
  });

  it("represents a pure addition at its insertion position", () => {
    expect(
      diffLines(["Launch", "Email support"], ["Launch", "API access", "Email support"]),
    ).toEqual([
      {
        before: [],
        after: ["API access"],
        beforeStart: 1,
        afterStart: 1,
      },
    ]);
  });

  it("represents a pure removal at its former position", () => {
    expect(
      diffLines(["Launch", "5 projects", "Email support"], ["Launch", "Email support"]),
    ).toEqual([
      {
        before: ["5 projects"],
        after: [],
        beforeStart: 1,
        afterStart: 1,
      },
    ]);
  });

  it("returns no fragments for identical input", () => {
    expect(diffLines(["Pricing", "Launch"], ["Pricing", "Launch"])).toEqual([]);
  });

  it("aligns duplicate lines deterministically", () => {
    expect(diffLines(["A", "B", "A"], ["A", "A"])).toEqual([
      {
        before: ["B"],
        after: [],
        beforeStart: 1,
        afterStart: 1,
      },
    ]);
  });

  it("retains at most two surrounding lines per side for review context", () => {
    const result = diffLines(
      ["Zero", "One", "Two", "Old", "Four", "Five", "Six"],
      ["Zero", "One", "Two", "New", "Four", "Five", "Six"],
    );

    expect(result[0]?.context).toEqual({
      before: ["One", "Two", "Old", "Four", "Five"],
      after: ["One", "Two", "New", "Four", "Five"],
    });
  });

  it("avoids an oversized comparison matrix and discloses the bounded fallback", () => {
    const before = Array.from({ length: 401 }, (_, index) => `Before ${index}`);
    const after = Array.from({ length: 401 }, (_, index) => `After ${index}`);

    const result = diffLines(before, after);

    expect(result).toHaveLength(1);
    expect(result[0]?.before).toEqual(before);
    expect(result[0]?.after).toEqual(after);
    expect(result[0]?.limitations).toEqual([
      "Diff comparison exceeded 400 × 400 lines; a single replacement fragment was emitted.",
    ]);
  });
});
