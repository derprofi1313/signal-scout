import { describe, expect, it } from "vitest";

import { ConfigValidationError, parseConfig, safeParseConfig } from "@/core/config";

describe("Signal Scout configuration", () => {
  it("rejects embedded credentials and duplicate source ids", () => {
    const result = safeParseConfig({
      version: 1,
      sources: [
        {
          id: "pricing",
          name: "Pricing",
          url: "https://user:pass@example.com/pricing",
          kind: "pricing",
        },
        {
          id: "pricing",
          name: "Pricing 2",
          url: "https://example.org/pricing",
          kind: "pricing",
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual(["sources.0.url", "sources.1.id"]);
    }
  });

  it("applies storage and selector defaults", () => {
    expect(
      parseConfig({
        version: 1,
        sources: [
          {
            id: "demo-pricing",
            name: "Demo pricing fixture",
            url: "https://example.com/pricing",
            kind: "pricing",
          },
        ],
      }),
    ).toEqual({
      version: 1,
      storageDir: ".signal-scout",
      sources: [
        {
          id: "demo-pricing",
          name: "Demo pricing fixture",
          url: "https://example.com/pricing",
          kind: "pricing",
          ignoreSelectors: [],
        },
      ],
    });
  });

  it("enforces strict source, count, and selector boundaries", () => {
    const result = safeParseConfig({
      version: 1,
      unexpected: true,
      sources: [
        {
          id: "Not Valid",
          name: "Pricing",
          url: "file:///tmp/pricing.html",
          kind: "unknown",
          ignoreSelectors: Array.from({ length: 21 }, (_, index) => `.volatile-${index}`),
          extra: true,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([
          "",
          "sources.0",
          "sources.0.id",
          "sources.0.url",
          "sources.0.kind",
          "sources.0.ignoreSelectors",
        ]),
      );
    }
  });

  it.each([
    ["not a URL", "Must be a valid public HTTP(S) URL"],
    ["http://localhost/pricing", "Must target a public host"],
    ["http://dashboard.local/pricing", "Must target a public host"],
    ["http://127.0.0.1/pricing", "Must target a public host"],
    ["http://[::1]/pricing", "Must target a public host"],
  ])("rejects non-public source URL %s", (url, message) => {
    const result = safeParseConfig({
      version: 1,
      sources: [{ id: "pricing", name: "Pricing", url, kind: "pricing" }],
    });

    expect(result).toEqual({
      ok: false,
      issues: [{ path: "sources.0.url", message }],
    });
  });

  it("accepts a public literal IP address without weakening private-host checks", () => {
    expect(
      parseConfig({
        version: 1,
        sources: [
          {
            id: "public-ip",
            name: "Public IP",
            url: "https://8.8.8.8/pricing",
            kind: "pricing",
          },
        ],
      }).sources[0]?.url,
    ).toBe("https://8.8.8.8/pricing");
  });

  it("throws a field-aware ConfigValidationError from the strict parser", () => {
    let thrown: unknown;
    try {
      parseConfig({ version: 1, sources: [] });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConfigValidationError);
    expect(thrown).toMatchObject({
      name: "ConfigValidationError",
      issues: [{ path: "sources" }],
    });
  });
});
