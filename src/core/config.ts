import { isIP } from "node:net";

import { z } from "zod";

import {
  SOURCE_KINDS,
  type ConfigIssue,
  type SafeParseConfigResult,
  type SignalScoutConfig,
} from "./types";

const sourceIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }

  const [first = -1, second = -1] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

function publicHttpUrlIssue(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Must be a valid public HTTP(S) URL";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Must use the http: or https: protocol";
  }
  if (url.username || url.password) {
    return "Embedded URL credentials are not allowed";
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    (isIP(hostname) === 4 && isPrivateIpv4(hostname)) ||
    (isIP(hostname.replace(/^\[|\]$/g, "")) === 6 && isPrivateIpv6(hostname))
  ) {
    return "Must target a public host";
  }

  return null;
}

const publicHttpUrlSchema = z
  .string()
  .min(1)
  .max(2_048)
  .superRefine((value, context) => {
    const issue = publicHttpUrlIssue(value);
    if (issue) {
      context.addIssue({ code: "custom", message: issue });
    }
  });

const sourceSchema = z
  .object({
    id: z.string().min(1).max(64).regex(sourceIdPattern, {
      message: "Use lowercase letters, numbers, and single hyphens",
    }),
    name: z.string().trim().min(1).max(160),
    url: publicHttpUrlSchema,
    kind: z.enum(SOURCE_KINDS),
    ignoreSelectors: z.array(z.string().trim().min(1).max(512)).max(20).default([]),
  })
  .strict();

const configSchema = z
  .object({
    $schema: z.string().min(1).max(2_048).optional(),
    version: z.literal(1),
    storageDir: z.string().trim().min(1).max(1_024).default(".signal-scout"),
    sources: z.array(sourceSchema).min(1).max(50),
  })
  .strict()
  .superRefine((config, context) => {
    const firstIndexById = new Map<string, number>();
    config.sources.forEach((source, index) => {
      if (firstIndexById.has(source.id)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "id"],
          message: `Duplicate source id "${source.id}"`,
        });
      } else {
        firstIndexById.set(source.id, index);
      }
    });
  });

function formatPath(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

function toIssues(error: z.ZodError): ConfigIssue[] {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));
}

export class ConfigValidationError extends Error {
  readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[]) {
    super("Signal Scout configuration is invalid");
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

export function safeParseConfig(input: unknown): SafeParseConfigResult {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, issues: toIssues(result.error) };
  }
  return { ok: true, value: result.data as SignalScoutConfig };
}

export function parseConfig(input: unknown): SignalScoutConfig {
  const result = safeParseConfig(input);
  if (!result.ok) {
    throw new ConfigValidationError(result.issues);
  }
  return result.value;
}
