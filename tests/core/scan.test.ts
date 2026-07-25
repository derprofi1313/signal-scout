import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CaptureError, fetchSource } from "@/core/fetch";
import { scanSources } from "@/core/scan";
import type {
  FetchResult,
  SignalScoutConfig,
  SignalScoutSource,
  SourceFetcher,
} from "@/core/types";

const fixtureBeforeUrl = new URL("../fixtures/demo-before.html", import.meta.url);
const fixtureAfterUrl = new URL("../fixtures/demo-after.html", import.meta.url);
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "signal-scout-scan-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function source(overrides: Partial<SignalScoutSource> = {}): SignalScoutSource {
  return {
    id: "demo-pricing",
    name: "Demo pricing fixture",
    url: "https://example.com/pricing",
    kind: "pricing",
    ignoreSelectors: [".cookie-banner", "[data-volatile]"],
    ...overrides,
  };
}

function capture(body: string, capturedAt: string, captureSource = source()): FetchResult {
  return {
    body,
    metadata: {
      capturedAt,
      requestedUrl: captureSource.url,
      finalUrl: captureSource.url,
      statusCode: 200,
      contentType: "text/html",
      bytes: Buffer.byteLength(body),
    },
  };
}

describe("scan pipeline", () => {
  it("writes a baseline, then changed evidence, then a no-change packet", async () => {
    const storageDir = await temporaryDirectory();
    const before = await readFile(fixtureBeforeUrl, "utf8");
    const after = await readFile(fixtureAfterUrl, "utf8");
    const captures = [
      capture(before, "2026-07-25T10:00:00.000Z"),
      capture(after, "2026-07-25T11:00:00.000Z"),
      capture(after, "2026-07-25T12:00:00.000Z"),
    ];
    let captureIndex = 0;
    const fetcher: SourceFetcher = async () => captures[captureIndex++]!;
    const config: SignalScoutConfig = {
      version: 1,
      storageDir,
      sources: [source()],
    };

    const baselineRun = await scanSources(config, { fetcher });
    expect(baselineRun.packets[0]?.status).toBe("baseline");
    expect(
      JSON.parse(await readFile(join(storageDir, "baselines", "demo-pricing.json"), "utf8")),
    ).toMatchObject({
      schema: "signal-scout/baseline@1",
      sourceId: "demo-pricing",
    });
    await expect(
      readFile(join(storageDir, "reports", "demo-pricing.md"), "utf8"),
    ).resolves.toContain("**Schema:** `signal-scout/evidence@1`");

    const changedRun = await scanSources(config, { fetcher });
    expect(changedRun.packets[0]?.status).toBe("changed");
    expect(changedRun.packets[0]?.changes.map((change) => change.category)).toEqual([
      "pricing",
      "product",
    ]);

    const unchangedRun = await scanSources(config, { fetcher });
    expect(unchangedRun.packets[0]?.status).toBe("no_change");
    expect(unchangedRun.packets[0]?.changes).toEqual([]);
    expect(
      JSON.parse(await readFile(join(storageDir, "reports", "demo-pricing.json"), "utf8")),
    ).toMatchObject({
      schema: "signal-scout/evidence@1",
      status: "no_change",
    });
    expect((await readdir(storageDir)).sort()).toEqual(["baselines", "reports"]);
  });

  it("preserves successful source output when another source fails", async () => {
    const storageDir = await temporaryDirectory();
    const before = await readFile(fixtureBeforeUrl, "utf8");
    const workingSource = source();
    const failingSource = source({
      id: "broken-page",
      name: "Broken page",
      url: "https://example.net/broken",
    });
    const fetcher: SourceFetcher = async (currentSource) => {
      if (currentSource.id === failingSource.id) {
        throw new CaptureError("timeout", "Capture timed out after 15000 ms");
      }
      return capture(before, "2026-07-25T10:00:00.000Z", currentSource);
    };
    const config: SignalScoutConfig = {
      version: 1,
      storageDir,
      sources: [workingSource, failingSource],
    };

    const run = await scanSources(config, {
      fetcher,
      now: () => new Date("2026-07-25T10:00:00.000Z"),
    });

    expect(run).toMatchObject({ succeeded: 1, failed: 1 });
    expect(run.packets.map((packet) => packet.status)).toEqual(["baseline", "failed"]);
    expect(run.packets[1]?.error).toEqual({
      code: "timeout",
      message: "Capture timed out after 15000 ms",
    });
    await expect(
      readFile(join(storageDir, "reports", "demo-pricing.json"), "utf8"),
    ).resolves.toContain('"status": "baseline"');
    await expect(
      readFile(join(storageDir, "reports", "broken-page.json"), "utf8"),
    ).resolves.toContain('"status": "failed"');
  });

  it("stores semantic lines for an accepted plain-text source", async () => {
    const storageDir = await temporaryDirectory();
    const textSource = source({
      id: "release-notes",
      name: "Release notes",
      url: "https://example.com/changelog.txt",
      kind: "changelog",
    });
    const config: SignalScoutConfig = {
      version: 1,
      storageDir,
      sources: [textSource],
    };
    const fetcher: SourceFetcher = async () => ({
      body: "Release 1.2\nAPI access added",
      metadata: {
        capturedAt: "2026-07-25T10:00:00.000Z",
        requestedUrl: textSource.url,
        finalUrl: textSource.url,
        statusCode: 200,
        contentType: "text/plain",
        bytes: 28,
      },
    });

    await scanSources(config, { fetcher });

    const baseline = JSON.parse(
      await readFile(join(storageDir, "baselines", "release-notes.json"), "utf8"),
    );
    expect(baseline.capture.normalized.lines).toEqual(["Release 1.2", "API access added"]);
  });

  it("maps an unexpected fetcher error into a reviewable failed packet", async () => {
    const storageDir = await temporaryDirectory();
    const config: SignalScoutConfig = {
      version: 1,
      storageDir,
      sources: [source()],
    };

    const run = await scanSources(config, {
      fetcher: async () => {
        throw new Error("Fetcher contract broke");
      },
      now: () => new Date("2026-07-25T10:00:00.000Z"),
    });

    expect(run).toMatchObject({ succeeded: 0, failed: 1 });
    expect(run.packets[0]).toMatchObject({
      status: "failed",
      error: {
        code: "capture_failed",
        message: "Fetcher contract broke",
      },
    });
  });
});

describe("guarded HTTP capture", () => {
  it("sets the capture contract and returns response metadata", async () => {
    const captureSource = source();
    let observedHeaders = new Headers();
    let observedRedirect: RequestRedirect | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      observedHeaders = new Headers(init?.headers);
      observedRedirect = init?.redirect;
      return new Response("<main><p>Evidence</p></main>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    };

    const result = await fetchSource(captureSource, {
      fetchImpl,
      now: () => new Date("2026-07-25T10:00:00.000Z"),
    });

    expect(observedHeaders.get("user-agent")).toBe(
      "SignalScout/0.1 (+https://github.com/derprofi1313/signal-scout)",
    );
    expect(observedRedirect).toBe("follow");
    expect(result.metadata).toEqual({
      capturedAt: "2026-07-25T10:00:00.000Z",
      requestedUrl: "https://example.com/pricing",
      finalUrl: "https://example.com/pricing",
      statusCode: 200,
      contentType: "text/html",
      bytes: 28,
    });
  });

  it("rejects unsupported MIME types", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response('{"not":"html"}', {
        headers: { "content-type": "application/json" },
      });

    await expect(fetchSource(source(), { fetchImpl })).rejects.toMatchObject({
      code: "unsupported_content_type",
    });
  });

  it("rejects a streamed response larger than two MiB", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
        headers: { "content-type": "text/plain" },
      });

    await expect(fetchSource(source(), { fetchImpl })).rejects.toMatchObject({
      code: "body_too_large",
    });
  });

  it("maps timeout failures to a stable capture error", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new DOMException("The operation timed out", "TimeoutError");
    };

    await expect(fetchSource(source(), { fetchImpl })).rejects.toEqual(
      new CaptureError("timeout", "Capture timed out after 15000 ms"),
    );
  });

  it("maps non-success HTTP responses before reading their body", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("<p>Unavailable</p>", {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "content-type": "text/html" },
      });

    await expect(fetchSource(source(), { fetchImpl })).rejects.toEqual(
      new CaptureError("http_status", "Capture returned HTTP 503 Service Unavailable"),
    );
  });

  it("rejects an oversized declared content length before streaming", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("small", {
        headers: {
          "content-type": "text/html",
          "content-length": String(2 * 1024 * 1024 + 1),
        },
      });

    await expect(fetchSource(source(), { fetchImpl })).rejects.toMatchObject({
      code: "body_too_large",
    });
  });

  it.each([
    [new Error("DNS lookup failed"), "Capture failed: DNS lookup failed"],
    ["socket closed", "Capture failed: socket closed"],
  ])("maps a network rejection into a stable error", async (rejection, message) => {
    const fetchImpl: typeof fetch = () => Promise.reject(rejection);

    await expect(fetchSource(source(), { fetchImpl })).rejects.toEqual(
      new CaptureError("network_error", message),
    );
  });

  it("accepts an empty response body for an allowed content type", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(null, {
        headers: { "content-type": "application/xhtml+xml" },
      });

    await expect(
      fetchSource(source(), {
        fetchImpl,
        now: () => new Date("2026-07-25T10:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      body: "",
      metadata: {
        contentType: "application/xhtml+xml",
        bytes: 0,
      },
    });
  });
});
