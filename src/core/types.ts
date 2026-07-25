export const EVIDENCE_SCHEMA_ID = "signal-scout/evidence@1" as const;

export const SOURCE_KINDS = [
  "pricing",
  "changelog",
  "product",
  "positioning",
  "policy",
  "general",
] as const;

export const CHANGE_CATEGORIES = [
  "pricing",
  "packaging",
  "product",
  "positioning",
  "policy",
  "general",
] as const;

export const PRIORITIES = ["low", "medium", "high"] as const;

export type EvidenceSchemaId = typeof EVIDENCE_SCHEMA_ID;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type EvidenceStatus = "baseline" | "no_change" | "changed" | "failed";

export interface SignalScoutSource {
  id: string;
  name: string;
  url: string;
  kind: SourceKind;
  ignoreSelectors: string[];
}

export interface SignalScoutConfig {
  $schema?: string;
  version: 1;
  storageDir: string;
  sources: SignalScoutSource[];
}

export interface ConfigIssue {
  path: string;
  message: string;
}

export type SafeParseConfigResult =
  { ok: true; value: SignalScoutConfig } | { ok: false; issues: ConfigIssue[] };

export interface NormalizeOptions {
  sourceUrl: string;
  ignoreSelectors?: readonly string[];
}

export interface NormalizedDocument {
  canonicalUrl: string;
  lines: string[];
  limitations: string[];
}

export interface DiffContext {
  before: string[];
  after: string[];
}

export interface DiffFragment {
  before: string[];
  after: string[];
  beforeStart: number;
  afterStart: number;
  context?: DiffContext;
  limitations?: string[];
}

export interface ClassifiedChange extends DiffFragment {
  category: ChangeCategory;
  priority: Priority;
  score: number;
  reasons: string[];
}

export interface CaptureMetadata {
  capturedAt: string;
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  bytes: number;
}

export interface CapturedDocument {
  raw: string;
  normalized: NormalizedDocument;
  metadata: CaptureMetadata;
}

export interface EvidenceHashes {
  raw: string;
  normalized: string;
}

export interface EvidenceSource {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  canonicalUrl: string;
}

export interface EvidenceSummary {
  totalChanges: number;
  addedLines: number;
  removedLines: number;
  categories: Record<ChangeCategory, number>;
  priorities: Record<Priority, number>;
}

export interface EvidenceError {
  code: string;
  message: string;
}

export interface EvidencePacket {
  schema: EvidenceSchemaId;
  id: string;
  status: EvidenceStatus;
  capturedAt: string;
  source: EvidenceSource;
  captures: {
    previous: CaptureMetadata | null;
    current: CaptureMetadata | null;
  };
  hashes: {
    previous: EvidenceHashes | null;
    current: EvidenceHashes | null;
  };
  changes: ClassifiedChange[];
  summary: EvidenceSummary;
  limitations: string[];
  error?: EvidenceError;
  fixture?: {
    synthetic: true;
    label: "Synthetic fixture";
  };
}

export interface PacketInput {
  source: SignalScoutSource;
  previous?: CapturedDocument | null;
  current?: CapturedDocument | null;
  status?: EvidenceStatus;
  changes?: readonly ClassifiedChange[];
  limitations?: readonly string[];
  capturedAt?: string;
  error?: EvidenceError;
  fixture?: EvidencePacket["fixture"];
}

export interface FetchResult {
  body: string;
  metadata: CaptureMetadata;
}

export type SourceFetcher = (source: SignalScoutSource) => Promise<FetchResult>;

export interface ScanDependencies {
  fetcher?: SourceFetcher;
  now?: () => Date;
  baseDir?: string;
}

export interface ScanRun {
  packets: EvidencePacket[];
  succeeded: number;
  failed: number;
}

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd?: string;
  fetcher?: SourceFetcher;
  now?: () => Date;
}
