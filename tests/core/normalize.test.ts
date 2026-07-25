import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { normalizeHtml, normalizeText } from "@/core/normalize";

const fixtureUrl = new URL("../fixtures/demo-before.html", import.meta.url);

describe("HTML normalization", () => {
  it("keeps ordered semantic evidence while removing configured noise", async () => {
    const html = await readFile(fixtureUrl, "utf8");

    const result = normalizeHtml(html, {
      sourceUrl: "https://example.com/pricing?campaign=fixture",
      ignoreSelectors: [".cookie-banner", "[data-volatile]"],
    });

    expect(result.lines).toEqual([
      "Pricing",
      "Launch",
      "$29 per workspace / month",
      "5 projects",
      "Email support",
    ]);
    expect(result.canonicalUrl).toBe("https://fixture.invalid/pricing");
    expect(result.limitations).toEqual([]);
  });

  it("collapses Unicode whitespace and adjacent duplicate lines", () => {
    const result = normalizeHtml(
      "<main><h1>Product\u00a0 updates</h1><p>Same line</p><p>Same   line</p></main>",
      { sourceUrl: "https://example.com/updates" },
    );

    expect(result.lines).toEqual(["Product updates", "Same line"]);
  });

  it("caps semantic output at 800 lines and discloses the truncation", () => {
    const html = `<main>${Array.from(
      { length: 805 },
      (_, index) => `<p>Evidence ${index + 1}</p>`,
    ).join("")}</main>`;

    const result = normalizeHtml(html, { sourceUrl: "https://example.com/long" });

    expect(result.lines).toHaveLength(800);
    expect(result.lines.at(-1)).toBe("Evidence 800");
    expect(result.limitations).toEqual([
      "Normalized output was truncated from 805 to 800 semantic lines.",
    ]);
  });

  it("discloses invalid ignore selectors instead of aborting the capture", () => {
    const result = normalizeHtml("<main><p>Evidence</p></main>", {
      sourceUrl: "https://example.com",
      ignoreSelectors: ["["],
    });

    expect(result.lines).toEqual(["Evidence"]);
    expect(result.limitations).toEqual(['Ignore selector "[" could not be applied.']);
  });

  it("preserves semantic lines from an accepted plain-text source", () => {
    expect(
      normalizeText("Release 1.2\n\n  API\u00a0access added  \nAPI access added", {
        sourceUrl: "https://example.com/changelog.txt",
      }),
    ).toEqual({
      canonicalUrl: "https://example.com/changelog.txt",
      lines: ["Release 1.2", "API access added"],
      limitations: [],
    });
  });
});
