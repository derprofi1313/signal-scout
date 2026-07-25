import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "@/cli/index";
import { parseConfig } from "@/core/config";
import { CaptureError } from "@/core/fetch";
import type { CliIo, FetchResult, SignalScoutSource } from "@/core/types";

const fixtureUrl = new URL("../fixtures/demo-before.html", import.meta.url);
const temporaryDirectories: string[] = [];
const storedPacket = {
  schema: "signal-scout/evidence@1",
  id: "demo-failed-000000000000",
  status: "failed",
  capturedAt: "2026-07-25T12:00:00.000Z",
  source: {
    id: "demo",
    name: "Demo",
    kind: "general",
    url: "https://example.com",
    canonicalUrl: "https://example.com",
  },
  captures: { previous: null, current: null },
  hashes: { previous: null, current: null },
  changes: [],
  summary: {
    totalChanges: 0,
    addedLines: 0,
    removedLines: 0,
    categories: {
      pricing: 0,
      packaging: 0,
      product: 0,
      positioning: 0,
      policy: 0,
      general: 0,
    },
    priorities: { low: 0, medium: 0, high: 0 },
  },
  limitations: [],
  error: { code: "network_error", message: "Offline" },
} as const;

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "signal-scout-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeStoredPacket(directory: string): Promise<string> {
  const packetPath = join(directory, "packet.json");
  await writeFile(packetPath, JSON.stringify(storedPacket), "utf8");
  return packetPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function io(cwd: string, fetcher?: CliIo["fetcher"]) {
  let stdout = "";
  let stderr = "";
  const value: CliIo = {
    cwd,
    fetcher,
    now: () => new Date("2026-07-25T12:00:00.000Z"),
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  };
  return {
    value,
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

function capture(body: string, source: SignalScoutSource): FetchResult {
  return {
    body,
    metadata: {
      capturedAt: "2026-07-25T12:00:00.000Z",
      requestedUrl: source.url,
      finalUrl: source.url,
      statusCode: 200,
      contentType: "text/html",
      bytes: Buffer.byteLength(body),
    },
  };
}

describe("Signal Scout CLI", () => {
  it("initializes a valid starter config without overwriting an existing file", async () => {
    const directory = await temporaryDirectory();
    const firstIo = io(directory);

    expect(await runCli(["init", "--dir", directory], firstIo.value)).toBe(0);
    const configPath = join(directory, "signal-scout.config.json");
    const initialContent = await readFile(configPath, "utf8");
    expect(parseConfig(JSON.parse(initialContent))).toMatchObject({
      version: 1,
      storageDir: ".signal-scout",
    });

    const secondIo = io(directory);
    expect(await runCli(["init", "--dir", directory], secondIo.value)).toBe(2);
    expect(await readFile(configPath, "utf8")).toBe(initialContent);
    expect(secondIo.stderr()).toContain(
      "Move or delete the existing file before running `signal-scout init` again.",
    );
  });

  it("maps a missing configuration to exit code 2 with a field-level recovery message", async () => {
    const directory = await temporaryDirectory();
    const commandIo = io(directory);

    expect(
      await runCli(["scan", "--config", join(directory, "missing.json")], commandIo.value),
    ).toBe(2);
    expect(commandIo.stdout()).toBe("");
    expect(commandIo.stderr()).toContain("Configuration file not found");
  });

  it("scans to machine JSON and maps mixed source failure to exit code 1", async () => {
    const directory = await temporaryDirectory();
    const html = await readFile(fixtureUrl, "utf8");
    const configPath = join(directory, "signal-scout.config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        sources: [
          {
            id: "demo-pricing",
            name: "Demo pricing fixture",
            url: "https://example.com/pricing",
            kind: "pricing",
            ignoreSelectors: [".cookie-banner", "[data-volatile]"],
          },
          {
            id: "broken-page",
            name: "Broken page",
            url: "https://example.net/broken",
            kind: "general",
          },
        ],
      }),
      "utf8",
    );
    const commandIo = io(directory, async (source) => {
      if (source.id === "broken-page") {
        throw new CaptureError("timeout", "Capture timed out after 15000 ms");
      }
      return capture(html, source);
    });

    expect(await runCli(["scan", "--config", configPath], commandIo.value)).toBe(1);
    const output = JSON.parse(commandIo.stdout());
    expect(output.packets.map((packet: { status: string }) => packet.status)).toEqual([
      "baseline",
      "failed",
    ]);
    expect(commandIo.stderr()).toContain("1 source failed");
    await expect(
      readFile(join(directory, ".signal-scout", "reports", "demo-pricing.json"), "utf8"),
    ).resolves.toContain('"status": "baseline"');
    await expect(
      readFile(join(directory, ".signal-scout", "reports", "demo-pricing.md"), "utf8"),
    ).resolves.toContain("deterministic evidence");
  });

  it("renders a stored packet as Markdown or JSON", async () => {
    const directory = await temporaryDirectory();
    const packetPath = await writeStoredPacket(directory);

    const markdownIo = io(directory);
    expect(await runCli(["report", packetPath, "--format", "markdown"], markdownIo.value)).toBe(0);
    expect(markdownIo.stdout()).toContain("# Signal Scout evidence: Demo");

    const jsonIo = io(directory);
    expect(await runCli(["report", packetPath, "--format", "json"], jsonIo.value)).toBe(0);
    expect(JSON.parse(jsonIo.stdout())).toMatchObject({
      schema: "signal-scout/evidence@1",
      status: "failed",
    });
  });

  it("lists commands in help and reports the package version", async () => {
    const directory = await temporaryDirectory();
    const helpIo = io(directory);
    const versionIo = io(directory);

    expect(await runCli(["--help"], helpIo.value)).toBe(0);
    expect(helpIo.stderr()).toContain("init");
    expect(helpIo.stderr()).toContain("scan");
    expect(helpIo.stderr()).toContain("report");
    expect(await runCli(["--version"], versionIo.value)).toBe(0);
    expect(versionIo.stderr()).toContain("0.1.0");
  });

  it("supports empty, named, and short help and version routes", async () => {
    const directory = await temporaryDirectory();

    for (const argv of [[], ["help"], ["-h"]]) {
      const commandIo = io(directory);
      expect(await runCli(argv, commandIo.value)).toBe(0);
      expect(commandIo.stderr()).toContain("Usage:");
    }

    const versionIo = io(directory);
    expect(await runCli(["-v"], versionIo.value)).toBe(0);
    expect(versionIo.stderr()).toBe("0.1.0\n");
  });

  it("rejects an unknown command with a direct help route", async () => {
    const directory = await temporaryDirectory();
    const commandIo = io(directory);

    expect(await runCli(["publish"], commandIo.value)).toBe(2);
    expect(commandIo.stdout()).toBe("");
    expect(commandIo.stderr()).toContain("Unknown command: publish");
    expect(commandIo.stderr()).toContain("signal-scout --help");
  });

  it.each([
    {
      name: "missing init directory",
      argv: ["init", "--dir"],
      message: "Option --dir requires a value.",
    },
    {
      name: "unknown init argument",
      argv: ["init", "--force"],
      message: "Unknown init argument: --force",
    },
    {
      name: "missing scan config path",
      argv: ["scan", "--config"],
      message: "Option --config requires a value.",
    },
    {
      name: "unknown scan argument",
      argv: ["scan", "--force"],
      message: "Unknown scan argument: --force",
    },
    {
      name: "missing report format",
      argv: ["report", "packet.json", "--format"],
      message: "Option --format requires a value.",
    },
    {
      name: "unsupported report format",
      argv: ["report", "packet.json", "--format", "xml"],
      message: 'Report format must be either "markdown" or "json".',
    },
    {
      name: "missing report packet",
      argv: ["report"],
      message: "Usage: signal-scout report",
    },
  ])("rejects $name", async ({ argv, message }) => {
    const directory = await temporaryDirectory();
    const commandIo = io(directory);

    expect(await runCli(argv, commandIo.value)).toBe(2);
    expect(commandIo.stdout()).toBe("");
    expect(commandIo.stderr()).toContain(message);
  });

  it("initializes in the current directory when --dir is omitted", async () => {
    const directory = await temporaryDirectory();
    const commandIo = io(directory);

    expect(await runCli(["init"], commandIo.value)).toBe(0);
    await expect(readFile(join(directory, "signal-scout.config.json"), "utf8")).resolves.toContain(
      '"version": 1',
    );
  });

  it("reports malformed JSON and invalid configuration fields as exit code 2", async () => {
    const directory = await temporaryDirectory();
    const configPath = join(directory, "signal-scout.config.json");

    await writeFile(configPath, "{", "utf8");
    const malformedIo = io(directory);
    expect(await runCli(["scan"], malformedIo.value)).toBe(2);
    expect(malformedIo.stderr()).toContain("Configuration is not valid JSON");

    await writeFile(
      configPath,
      JSON.stringify({ version: 2, sources: [], unexpected: true }),
      "utf8",
    );
    const invalidIo = io(directory);
    expect(await runCli(["scan"], invalidIo.value)).toBe(2);
    expect(invalidIo.stderr()).toContain("Configuration is invalid:");
    expect(invalidIo.stderr()).toContain("- <root>:");
    expect(invalidIo.stderr()).toContain("- version:");
    expect(invalidIo.stderr()).toContain("- sources:");
  });

  it("returns exit code 0 for a fully successful scan using the default config path", async () => {
    const directory = await temporaryDirectory();
    const html = await readFile(fixtureUrl, "utf8");
    await writeFile(
      join(directory, "signal-scout.config.json"),
      JSON.stringify({
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
      "utf8",
    );
    const commandIo = io(directory, async (source) => capture(html, source));

    expect(await runCli(["scan"], commandIo.value)).toBe(0);
    expect(JSON.parse(commandIo.stdout()).packets[0]).toMatchObject({
      status: "baseline",
      source: { id: "demo-pricing" },
    });
    expect(commandIo.stderr()).toContain("Scanned 1 source; 0 sources failed.");
  });

  it("uses Markdown as the default report format", async () => {
    const directory = await temporaryDirectory();
    const packetPath = await writeStoredPacket(directory);
    const commandIo = io(directory);

    expect(await runCli(["report", packetPath], commandIo.value)).toBe(0);
    expect(commandIo.stdout()).toContain("# Signal Scout evidence: Demo");
  });

  it("rejects missing, unreadable, and incompatible evidence packets", async () => {
    const directory = await temporaryDirectory();
    const missingIo = io(directory);
    expect(await runCli(["report", "missing.json"], missingIo.value)).toBe(2);
    expect(missingIo.stderr()).toContain("Evidence packet not found");

    const malformedPath = join(directory, "malformed.json");
    await writeFile(malformedPath, "{", "utf8");
    const malformedIo = io(directory);
    expect(await runCli(["report", malformedPath], malformedIo.value)).toBe(2);
    expect(malformedIo.stderr()).toContain("Could not read evidence packet");

    for (const invalidPacket of [null, {}, { ...storedPacket, limitations: undefined }]) {
      const incompatiblePath = join(directory, "incompatible.json");
      await writeFile(incompatiblePath, JSON.stringify(invalidPacket), "utf8");
      const incompatibleIo = io(directory);
      expect(await runCli(["report", incompatiblePath], incompatibleIo.value)).toBe(2);
      expect(incompatibleIo.stderr()).toContain(
        "Evidence packet is not compatible with signal-scout/evidence@1",
      );
    }
  });
});
