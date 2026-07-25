import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { safeParseConfig } from "../core/config";
import { renderMarkdown } from "../core/report";
import { scanSources } from "../core/scan";
import type { CliIo, EvidencePacket, SignalScoutConfig } from "../core/types";

const VERSION = "0.1.0";
const CONFIG_FILENAME = "signal-scout.config.json";
const helpText = `Signal Scout ${VERSION}

Usage:
  signal-scout init [--dir <directory>]
  signal-scout scan [--config <path>]
  signal-scout report <packet.json> [--format markdown|json]

Commands:
  init      Create a starter configuration without overwriting existing work
  scan      Capture configured sources and write deterministic reports
  report    Render a stored evidence packet as Markdown or JSON

Options:
  -h, --help       Show this help
  -v, --version    Show the package version
`;

const starterConfig: SignalScoutConfig = {
  $schema: "./signal-scout.schema.json",
  version: 1,
  storageDir: ".signal-scout",
  sources: [
    {
      id: "competitor-pricing",
      name: "Competitor pricing page",
      url: "https://example.com/pricing",
      kind: "pricing",
      ignoreSelectors: [".cookie-banner", "[data-volatile]"],
    },
  ],
};

function defaultIo(): CliIo {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
}

function writeLine(writer: (text: string) => void, text: string): void {
  writer(text.endsWith("\n") ? text : `${text}\n`);
}

function absolutePath(path: string, cwd: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function option(
  args: readonly string[],
  name: string,
): { value?: string; remaining: string[]; error?: string } {
  const remaining = [...args];
  const index = remaining.indexOf(name);
  if (index === -1) {
    return { remaining };
  }
  const value = remaining[index + 1];
  if (!value || value.startsWith("--")) {
    return { remaining, error: `Option ${name} requires a value.` };
  }
  remaining.splice(index, 2);
  return { value, remaining };
}

function configIssuePath(path: string): string {
  return path || "<root>";
}

function isEvidencePacket(value: unknown): value is EvidencePacket {
  if (!value || typeof value !== "object") {
    return false;
  }
  const packet = value as Partial<EvidencePacket>;
  return (
    packet.schema === "signal-scout/evidence@1" &&
    typeof packet.id === "string" &&
    typeof packet.status === "string" &&
    typeof packet.capturedAt === "string" &&
    !!packet.source &&
    typeof packet.source === "object" &&
    !!packet.captures &&
    typeof packet.captures === "object" &&
    !!packet.hashes &&
    typeof packet.hashes === "object" &&
    Array.isArray(packet.changes) &&
    !!packet.summary &&
    typeof packet.summary === "object" &&
    Array.isArray(packet.limitations)
  );
}

async function initCommand(args: readonly string[], io: CliIo, cwd: string): Promise<number> {
  const directoryOption = option(args, "--dir");
  if (directoryOption.error) {
    writeLine(io.stderr, directoryOption.error);
    return 2;
  }
  if (directoryOption.remaining.length > 0) {
    writeLine(io.stderr, `Unknown init argument: ${directoryOption.remaining[0]}`);
    return 2;
  }

  const targetDirectory = absolutePath(directoryOption.value ?? cwd, cwd);
  const configPath = join(targetDirectory, CONFIG_FILENAME);
  await mkdir(targetDirectory, { recursive: true });
  try {
    await writeFile(configPath, `${JSON.stringify(starterConfig, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      writeLine(io.stderr, `Configuration already exists at ${configPath}.`);
      writeLine(
        io.stderr,
        "Move or delete the existing file before running `signal-scout init` again.",
      );
      return 2;
    }
    throw error;
  }

  writeLine(io.stderr, `Created ${configPath}. Edit the source URL, then run signal-scout scan.`);
  return 0;
}

async function readConfig(path: string, io: CliIo): Promise<SignalScoutConfig | null> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      writeLine(io.stderr, `Configuration file not found: ${path}`);
      writeLine(io.stderr, "Run `signal-scout init` or pass an existing file with --config.");
      return null;
    }
    throw error;
  }

  let input: unknown;
  try {
    input = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeLine(io.stderr, `Configuration is not valid JSON: ${message}`);
    return null;
  }

  const result = safeParseConfig(input);
  if (!result.ok) {
    writeLine(io.stderr, "Configuration is invalid:");
    for (const issue of result.issues) {
      writeLine(io.stderr, `- ${configIssuePath(issue.path)}: ${issue.message}`);
    }
    return null;
  }
  return result.value;
}

async function scanCommand(args: readonly string[], io: CliIo, cwd: string): Promise<number> {
  const configOption = option(args, "--config");
  if (configOption.error) {
    writeLine(io.stderr, configOption.error);
    return 2;
  }
  if (configOption.remaining.length > 0) {
    writeLine(io.stderr, `Unknown scan argument: ${configOption.remaining[0]}`);
    return 2;
  }

  const configPath = absolutePath(configOption.value ?? CONFIG_FILENAME, cwd);
  const config = await readConfig(configPath, io);
  if (!config) {
    return 2;
  }

  const run = await scanSources(config, {
    baseDir: dirname(configPath),
    ...(io.fetcher ? { fetcher: io.fetcher } : {}),
    ...(io.now ? { now: io.now } : {}),
  });
  writeLine(io.stdout, JSON.stringify(run, null, 2));
  writeLine(
    io.stderr,
    `Scanned ${run.packets.length} source${run.packets.length === 1 ? "" : "s"}; ${run.failed} source${run.failed === 1 ? "" : "s"} failed.`,
  );
  return run.failed > 0 ? 1 : 0;
}

async function reportCommand(args: readonly string[], io: CliIo, cwd: string): Promise<number> {
  const formatOption = option(args, "--format");
  if (formatOption.error) {
    writeLine(io.stderr, formatOption.error);
    return 2;
  }
  if (
    formatOption.value !== undefined &&
    formatOption.value !== "markdown" &&
    formatOption.value !== "json"
  ) {
    writeLine(io.stderr, 'Report format must be either "markdown" or "json".');
    return 2;
  }
  if (formatOption.remaining.length !== 1) {
    writeLine(io.stderr, "Usage: signal-scout report <packet.json> [--format markdown|json]");
    return 2;
  }

  const packetPath = absolutePath(formatOption.remaining[0]!, cwd);
  let input: unknown;
  try {
    input = JSON.parse(await readFile(packetPath, "utf8"));
  } catch (error) {
    const prefix =
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "Evidence packet not found"
        : "Could not read evidence packet";
    writeLine(io.stderr, `${prefix}: ${packetPath}`);
    return 2;
  }
  if (!isEvidencePacket(input)) {
    writeLine(
      io.stderr,
      `Evidence packet is not compatible with signal-scout/evidence@1: ${packetPath}`,
    );
    return 2;
  }

  const output =
    (formatOption.value ?? "markdown") === "json"
      ? `${JSON.stringify(input, null, 2)}\n`
      : renderMarkdown(input);
  io.stdout(output.endsWith("\n") ? output : `${output}\n`);
  return 0;
}

export async function runCli(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  const cwd = io.cwd ?? process.cwd();
  const [command, ...args] = argv;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    io.stderr(helpText);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    writeLine(io.stderr, VERSION);
    return 0;
  }

  try {
    if (command === "init") {
      return await initCommand(args, io, cwd);
    }
    if (command === "scan") {
      return await scanCommand(args, io, cwd);
    }
    if (command === "report") {
      return await reportCommand(args, io, cwd);
    }
    writeLine(io.stderr, `Unknown command: ${command}`);
    writeLine(io.stderr, "Run `signal-scout --help` for usage.");
    return 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeLine(io.stderr, `Signal Scout failed: ${message}`);
    return 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2));
}
