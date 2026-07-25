import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readBaseline, storageRoot, StorageError, writeBaseline } from "@/core/storage";
import type { CapturedDocument } from "@/core/types";

const temporaryDirectories: string[] = [];
const capture: CapturedDocument = {
  raw: "<main><p>Evidence</p></main>",
  normalized: {
    canonicalUrl: "https://example.com/pricing",
    lines: ["Evidence"],
    limitations: [],
  },
  metadata: {
    capturedAt: "2026-07-25T10:00:00.000Z",
    requestedUrl: "https://example.com/pricing",
    finalUrl: "https://example.com/pricing",
    statusCode: 200,
    contentType: "text/html",
    bytes: 28,
  },
};

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "signal-scout-storage-"));
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

describe("baseline storage", () => {
  it("resolves relative storage against the config directory and keeps absolute paths", async () => {
    const directory = await temporaryDirectory();

    expect(storageRoot(".signal-scout", directory)).toBe(join(directory, ".signal-scout"));
    expect(storageRoot(directory, "/ignored")).toBe(directory);
  });

  it("returns null only when a baseline is absent", async () => {
    const directory = await temporaryDirectory();

    await expect(readBaseline(directory, "missing")).resolves.toBeNull();
  });

  it("round-trips a baseline through an atomic file without leftover siblings", async () => {
    const directory = await temporaryDirectory();

    await writeBaseline(directory, "demo-pricing", capture);

    await expect(readBaseline(directory, "demo-pricing")).resolves.toEqual(capture);
    expect(await readdir(join(directory, "baselines"))).toEqual(["demo-pricing.json"]);
    expect(await readFile(join(directory, "baselines", "demo-pricing.json"), "utf8")).toContain(
      '"schema": "signal-scout/baseline@1"',
    );
  });

  it.each([
    { content: "null", name: "non-object baseline" },
    {
      content: JSON.stringify({
        schema: "signal-scout/baseline@1",
        sourceId: "another-source",
        capture,
      }),
      name: "mismatched source id",
    },
  ])("rejects a $name instead of trusting corrupt state", async ({ content }) => {
    const directory = await temporaryDirectory();
    const baselinesDirectory = join(directory, "baselines");
    await mkdir(baselinesDirectory, { recursive: true });
    await writeFile(join(baselinesDirectory, "demo-pricing.json"), content, "utf8");

    await expect(readBaseline(directory, "demo-pricing")).rejects.toMatchObject({
      name: "StorageError",
      code: "storage_error",
      message: expect.stringContaining("is invalid"),
    });
  });

  it("removes the temporary sibling when an atomic rename cannot replace the target", async () => {
    const directory = await temporaryDirectory();
    const baselinesDirectory = join(directory, "baselines");
    await mkdir(join(baselinesDirectory, "demo-pricing.json"), { recursive: true });

    await expect(writeBaseline(directory, "demo-pricing", capture)).rejects.toBeInstanceOf(
      StorageError,
    );
    expect(await readdir(baselinesDirectory)).toEqual(["demo-pricing.json"]);
  });
});
