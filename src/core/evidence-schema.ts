import { z } from "zod";

import {
  CHANGE_CATEGORIES,
  EVIDENCE_SCHEMA_ID,
  PRIORITIES,
  SOURCE_KINDS,
  type ChangeCategory,
  type EvidencePacket,
  type Priority,
} from "./types";
import { classifyFragment } from "./classify";
import { sha256 } from "./packet";

const EVIDENCE_STATUSES = ["baseline", "no_change", "changed", "failed"] as const;
const CAPTURE_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"] as const;
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;
const hashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/i, "Expected a complete 64-character hexadecimal SHA-256 hash");
const timestampSchema = z.iso.datetime();
const nonEmptyStringSchema = z.string().min(1);
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const httpUrlSchema = z.url({ protocol: /^https?$/ }).refine(
  (value) => {
    try {
      const url = new URL(value);
      return url.username === "" && url.password === "";
    } catch {
      return false;
    }
  },
  { message: "HTTP(S) URLs must not contain embedded credentials" },
);

const captureMetadataSchema = z.strictObject({
  capturedAt: timestampSchema,
  requestedUrl: httpUrlSchema,
  finalUrl: httpUrlSchema,
  statusCode: z.number().int().min(200).max(299),
  contentType: z.enum(CAPTURE_CONTENT_TYPES),
  bytes: nonNegativeIntegerSchema.max(MAX_CAPTURE_BYTES),
});

const evidenceHashesSchema = z.strictObject({
  raw: hashSchema,
  normalized: hashSchema,
});

const evidenceSourceSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: nonEmptyStringSchema,
  kind: z.enum(SOURCE_KINDS),
  url: httpUrlSchema,
  canonicalUrl: httpUrlSchema,
});

const diffContextSchema = z.strictObject({
  before: z.array(nonEmptyStringSchema),
  after: z.array(nonEmptyStringSchema),
});

const classifiedChangeSchema = z
  .strictObject({
    before: z.array(nonEmptyStringSchema),
    after: z.array(nonEmptyStringSchema),
    beforeStart: nonNegativeIntegerSchema,
    afterStart: nonNegativeIntegerSchema,
    context: diffContextSchema.optional(),
    limitations: z.array(nonEmptyStringSchema).optional(),
    category: z.enum(CHANGE_CATEGORIES),
    priority: z.enum(PRIORITIES),
    score: z.number().int().min(0).max(100),
    reasons: z.array(nonEmptyStringSchema).min(1),
  })
  .superRefine((change, context) => {
    if (change.before.length === 0 && change.after.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["after"],
        message: "A change must contain at least one removed or added line",
      });
    }
  });

const summarySchema = z.strictObject({
  totalChanges: nonNegativeIntegerSchema,
  addedLines: nonNegativeIntegerSchema,
  removedLines: nonNegativeIntegerSchema,
  categories: z.strictObject({
    pricing: nonNegativeIntegerSchema,
    packaging: nonNegativeIntegerSchema,
    product: nonNegativeIntegerSchema,
    positioning: nonNegativeIntegerSchema,
    policy: nonNegativeIntegerSchema,
    general: nonNegativeIntegerSchema,
  }),
  priorities: z.strictObject({
    low: nonNegativeIntegerSchema,
    medium: nonNegativeIntegerSchema,
    high: nonNegativeIntegerSchema,
  }),
});

const evidenceErrorSchema = z.strictObject({
  code: z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
  message: nonEmptyStringSchema,
});

const fixtureSchema = z.strictObject({
  synthetic: z.literal(true),
  label: z.literal("Synthetic fixture"),
});

const packetShapeSchema = z.strictObject({
  schema: z.literal(EVIDENCE_SCHEMA_ID),
  id: nonEmptyStringSchema,
  status: z.enum(EVIDENCE_STATUSES),
  capturedAt: timestampSchema,
  source: evidenceSourceSchema,
  captures: z.strictObject({
    previous: captureMetadataSchema.nullable(),
    current: captureMetadataSchema.nullable(),
  }),
  hashes: z.strictObject({
    previous: evidenceHashesSchema.nullable(),
    current: evidenceHashesSchema.nullable(),
  }),
  changes: z.array(classifiedChangeSchema),
  summary: summarySchema,
  limitations: z.array(nonEmptyStringSchema),
  error: evidenceErrorSchema.optional(),
  fixture: fixtureSchema.optional(),
});

export const evidencePacketSchema: z.ZodType<EvidencePacket> = packetShapeSchema.superRefine(
  (packet, context) => {
    const issue = (path: PropertyKey[], message: string) => {
      context.addIssue({ code: "custom", path, message });
    };

    if ((packet.captures.previous === null) !== (packet.hashes.previous === null)) {
      issue(
        ["hashes", "previous"],
        "Previous capture metadata and hashes must either both be present or both be null",
      );
    }
    if ((packet.captures.current === null) !== (packet.hashes.current === null)) {
      issue(
        ["hashes", "current"],
        "Current capture metadata and hashes must either both be present or both be null",
      );
    }

    for (const captureKey of ["previous", "current"] as const) {
      const capture = packet.captures[captureKey];
      if (capture && capture.requestedUrl !== packet.source.url) {
        issue(
          ["captures", captureKey, "requestedUrl"],
          `${captureKey} capture must be requested from the packet source URL`,
        );
      }
    }

    if (packet.status === "failed") {
      if (!packet.error) {
        issue(["error"], "Failed packets require an error");
      }
      if (
        packet.captures.previous !== null ||
        packet.captures.current !== null ||
        packet.hashes.previous !== null ||
        packet.hashes.current !== null
      ) {
        issue(["status"], "Failed packets must not contain successful captures or hashes");
      }
      if (packet.changes.length > 0) {
        issue(["changes"], "Failed packets must not contain classified changes");
      }
    } else {
      if (packet.error) {
        issue(["error"], "Successful packets must not contain an error");
      }
      if (!packet.captures.current || !packet.hashes.current) {
        issue(["status"], `${packet.status} packets require a current capture and hashes`);
      }
      if (packet.captures.current && packet.capturedAt !== packet.captures.current.capturedAt) {
        issue(["capturedAt"], "Packet capture time must match the current capture");
      }
    }

    if (packet.status === "baseline") {
      if (packet.captures.previous !== null || packet.hashes.previous !== null) {
        issue(["status"], "Baseline packets must not contain previous evidence");
      }
      if (packet.changes.length > 0) {
        issue(["changes"], "Baseline packets must not contain changes");
      }
    }

    if (packet.status === "changed" || packet.status === "no_change") {
      if (!packet.captures.previous || !packet.hashes.previous) {
        issue(["status"], `${packet.status} packets require previous capture evidence`);
      }
    }

    if (packet.status === "changed") {
      if (packet.changes.length === 0) {
        issue(["changes"], "Changed packets require at least one classified change");
      }
      if (
        packet.hashes.previous &&
        packet.hashes.current &&
        packet.hashes.previous.normalized === packet.hashes.current.normalized
      ) {
        issue(["hashes", "current", "normalized"], "Changed packets require different hashes");
      }
    }

    if (packet.status === "no_change") {
      if (packet.changes.length > 0) {
        issue(["changes"], "No-change packets must not contain changes");
      }
      if (
        packet.hashes.previous &&
        packet.hashes.current &&
        packet.hashes.previous.normalized !== packet.hashes.current.normalized
      ) {
        issue(["hashes", "current", "normalized"], "No-change packets require equal hashes");
      }
    }

    const expectedPacketId =
      packet.status === "failed"
        ? packet.error
          ? `${packet.source.id}-${sha256(
              [packet.source.id, packet.error.code, packet.error.message, packet.capturedAt].join(
                "\n",
              ),
            ).slice(0, 12)}`
          : null
        : packet.hashes.current
          ? `${packet.source.id}-${packet.hashes.current.normalized.slice(0, 12)}`
          : null;
    if (expectedPacketId && packet.id !== expectedPacketId) {
      issue(["id"], "Packet id must match the source and evidence hash");
    }

    packet.changes.forEach((change, index) => {
      const expected = classifyFragment(
        {
          before: change.before,
          after: change.after,
          beforeStart: change.beforeStart,
          afterStart: change.afterStart,
          ...(change.context ? { context: change.context } : {}),
          ...(change.limitations ? { limitations: change.limitations } : {}),
        },
        packet.source.kind,
      );

      if (change.category !== expected.category) {
        issue(["changes", index, "category"], "Category must match deterministic classification");
      }
      if (change.priority !== expected.priority) {
        issue(["changes", index, "priority"], "Priority must match deterministic classification");
      }
      if (change.score !== expected.score) {
        issue(["changes", index, "score"], "Score must match deterministic classification");
      }
      if (
        change.reasons.length !== expected.reasons.length ||
        change.reasons.some((reason, reasonIndex) => reason !== expected.reasons[reasonIndex])
      ) {
        issue(["changes", index, "reasons"], "Reasons must match deterministic classification");
      }
    });

    for (let index = 1; index < packet.changes.length; index += 1) {
      const previous = packet.changes[index - 1]!;
      const current = packet.changes[index]!;
      const order =
        previous.beforeStart - current.beforeStart ||
        previous.afterStart - current.afterStart ||
        previous.category.localeCompare(current.category);
      if (order > 0) {
        issue(["changes", index], "Changes must use deterministic packet order");
      }
    }

    const categories: Record<ChangeCategory, number> = {
      pricing: 0,
      packaging: 0,
      product: 0,
      positioning: 0,
      policy: 0,
      general: 0,
    };
    const priorities: Record<Priority, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };
    let addedLines = 0;
    let removedLines = 0;

    for (const change of packet.changes) {
      categories[change.category] += 1;
      priorities[change.priority] += 1;
      addedLines += change.after.length;
      removedLines += change.before.length;
    }

    if (packet.summary.totalChanges !== packet.changes.length) {
      issue(["summary", "totalChanges"], "Total changes must equal the change record count");
    }
    if (packet.summary.addedLines !== addedLines) {
      issue(["summary", "addedLines"], "Added lines must equal the changed-line total");
    }
    if (packet.summary.removedLines !== removedLines) {
      issue(["summary", "removedLines"], "Removed lines must equal the changed-line total");
    }
    for (const category of CHANGE_CATEGORIES) {
      if (packet.summary.categories[category] !== categories[category]) {
        issue(
          ["summary", "categories", category],
          `${category} count must equal the classified change count`,
        );
      }
    }
    for (const priority of PRIORITIES) {
      if (packet.summary.priorities[priority] !== priorities[priority]) {
        issue(
          ["summary", "priorities", priority],
          `${priority} count must equal the classified change count`,
        );
      }
    }
  },
);

export function parseEvidencePacket(input: unknown): EvidencePacket {
  return evidencePacketSchema.parse(input);
}

export function safeParseEvidencePacket(input: unknown) {
  return evidencePacketSchema.safeParse(input);
}
