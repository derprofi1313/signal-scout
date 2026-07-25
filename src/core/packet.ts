import { createHash } from "node:crypto";

import {
  CHANGE_CATEGORIES,
  EVIDENCE_SCHEMA_ID,
  PRIORITIES,
  type CapturedDocument,
  type ChangeCategory,
  type ClassifiedChange,
  type EvidenceHashes,
  type EvidencePacket,
  type EvidenceStatus,
  type EvidenceSummary,
  type PacketInput,
  type Priority,
} from "./types";

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashCapture(capture: CapturedDocument): EvidenceHashes {
  return {
    raw: sha256(capture.raw),
    normalized: sha256(capture.normalized.lines.join("\n")),
  };
}

function orderChanges(changes: readonly ClassifiedChange[]): ClassifiedChange[] {
  return [...changes].sort(
    (left, right) =>
      left.beforeStart - right.beforeStart ||
      left.afterStart - right.afterStart ||
      left.category.localeCompare(right.category),
  );
}

function emptyCategoryCounts(): Record<ChangeCategory, number> {
  return Object.fromEntries(CHANGE_CATEGORIES.map((category) => [category, 0])) as Record<
    ChangeCategory,
    number
  >;
}

function emptyPriorityCounts(): Record<Priority, number> {
  return Object.fromEntries(PRIORITIES.map((priority) => [priority, 0])) as Record<
    Priority,
    number
  >;
}

function summarize(changes: readonly ClassifiedChange[]): EvidenceSummary {
  const categories = emptyCategoryCounts();
  const priorities = emptyPriorityCounts();
  let addedLines = 0;
  let removedLines = 0;

  for (const change of changes) {
    categories[change.category] += 1;
    priorities[change.priority] += 1;
    addedLines += change.after.length;
    removedLines += change.before.length;
  }

  return {
    totalChanges: changes.length,
    addedLines,
    removedLines,
    categories,
    priorities,
  };
}

function deriveStatus(
  requestedStatus: EvidenceStatus | undefined,
  previousHashes: EvidenceHashes | null,
  currentHashes: EvidenceHashes | null,
): EvidenceStatus {
  if (requestedStatus) {
    return requestedStatus;
  }
  if (!currentHashes) {
    return "failed";
  }
  if (!previousHashes) {
    return "baseline";
  }
  return previousHashes.normalized === currentHashes.normalized ? "no_change" : "changed";
}

function collectLimitations(input: PacketInput, changes: readonly ClassifiedChange[]): string[] {
  return [
    ...(input.previous?.normalized.limitations ?? []),
    ...(input.current?.normalized.limitations ?? []),
    ...changes.flatMap((change) => change.limitations ?? []),
    ...(input.limitations ?? []),
  ].filter((limitation, index, all) => all.indexOf(limitation) === index);
}

function failedPacketHashSeed(input: PacketInput): string {
  return [
    input.source.id,
    input.error?.code ?? "failed",
    input.error?.message ?? "",
    input.capturedAt ?? "",
  ].join("\n");
}

export function buildEvidencePacket(input: PacketInput): EvidencePacket {
  const previousHashes = input.previous ? hashCapture(input.previous) : null;
  const currentHashes = input.current ? hashCapture(input.current) : null;
  const changes = orderChanges(input.changes ?? []);
  const status = deriveStatus(input.status, previousHashes, currentHashes);
  const capturedAt =
    input.current?.metadata.capturedAt ??
    input.capturedAt ??
    input.previous?.metadata.capturedAt ??
    "1970-01-01T00:00:00.000Z";
  const packetHash = currentHashes?.normalized ?? sha256(failedPacketHashSeed(input));

  return {
    schema: EVIDENCE_SCHEMA_ID,
    id: `${input.source.id}-${packetHash.slice(0, 12)}`,
    status,
    capturedAt,
    source: {
      id: input.source.id,
      name: input.source.name,
      kind: input.source.kind,
      url: input.source.url,
      canonicalUrl:
        input.current?.normalized.canonicalUrl ??
        input.previous?.normalized.canonicalUrl ??
        input.source.url,
    },
    captures: {
      previous: input.previous?.metadata ?? null,
      current: input.current?.metadata ?? null,
    },
    hashes: {
      previous: previousHashes,
      current: currentHashes,
    },
    changes,
    summary: summarize(changes),
    limitations: collectLimitations(input, changes),
    ...(input.error ? { error: input.error } : {}),
    ...(input.fixture ? { fixture: input.fixture } : {}),
  };
}
