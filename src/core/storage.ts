import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import type { CapturedDocument, EvidencePacket } from "./types";

const BASELINE_SCHEMA_ID = "signal-scout/baseline@1" as const;

export interface StoredBaseline {
  schema: typeof BASELINE_SCHEMA_ID;
  sourceId: string;
  capture: CapturedDocument;
}

export class StorageError extends Error {
  readonly code = "storage_error";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StorageError";
  }
}

export function storageRoot(storageDir: string, baseDir = process.cwd()): string {
  return isAbsolute(storageDir) ? storageDir : resolve(baseDir, storageDir);
}

export function baselinePath(root: string, sourceId: string): string {
  return join(root, "baselines", `${sourceId}.json`);
}

export function reportJsonPath(root: string, sourceId: string): string {
  return join(root, "reports", `${sourceId}.json`);
}

export function reportMarkdownPath(root: string, sourceId: string): string {
  return join(root, "reports", `${sourceId}.md`);
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw new StorageError(`Could not atomically write ${path}`, { cause: error });
  }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

function isStoredBaseline(value: unknown, sourceId: string): value is StoredBaseline {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<StoredBaseline>;
  return (
    candidate.schema === BASELINE_SCHEMA_ID &&
    candidate.sourceId === sourceId &&
    !!candidate.capture &&
    typeof candidate.capture === "object"
  );
}

export async function readBaseline(
  root: string,
  sourceId: string,
): Promise<CapturedDocument | null> {
  const path = baselinePath(root, sourceId);
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new StorageError(`Could not read baseline ${path}`, { cause: error });
  }

  try {
    const value: unknown = JSON.parse(content);
    if (!isStoredBaseline(value, sourceId)) {
      throw new Error("baseline shape or source id does not match");
    }
    return value.capture;
  } catch (error) {
    throw new StorageError(`Baseline ${path} is invalid`, { cause: error });
  }
}

export async function writeBaseline(
  root: string,
  sourceId: string,
  capture: CapturedDocument,
): Promise<void> {
  await atomicWriteJson(baselinePath(root, sourceId), {
    schema: BASELINE_SCHEMA_ID,
    sourceId,
    capture,
  } satisfies StoredBaseline);
}

export async function writeEvidencePacket(root: string, packet: EvidencePacket): Promise<void> {
  await atomicWriteJson(reportJsonPath(root, packet.source.id), packet);
}

export async function writeMarkdownReport(
  root: string,
  sourceId: string,
  markdown: string,
): Promise<void> {
  await atomicWrite(reportMarkdownPath(root, sourceId), markdown);
}
