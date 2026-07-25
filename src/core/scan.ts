import { classifyFragment } from "./classify";
import { diffLines } from "./diff";
import { CaptureError, fetchSource } from "./fetch";
import { normalizeHtml, normalizeText } from "./normalize";
import { buildEvidencePacket } from "./packet";
import { renderMarkdown } from "./report";
import {
  readBaseline,
  storageRoot,
  StorageError,
  writeBaseline,
  writeEvidencePacket,
  writeMarkdownReport,
} from "./storage";
import type {
  CapturedDocument,
  EvidenceError,
  EvidencePacket,
  ScanDependencies,
  ScanRun,
  SignalScoutConfig,
} from "./types";

function evidenceError(error: unknown): EvidenceError {
  if (error instanceof CaptureError || error instanceof StorageError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "capture_failed",
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function scanSources(
  config: SignalScoutConfig,
  dependencies: ScanDependencies = {},
): Promise<ScanRun> {
  const root = storageRoot(config.storageDir, dependencies.baseDir);
  const fetcher = dependencies.fetcher ?? ((source) => fetchSource(source));
  const now = dependencies.now ?? (() => new Date());
  const packets: EvidencePacket[] = [];

  for (const source of config.sources) {
    try {
      const previous = await readBaseline(root, source.id);
      const fetched = await fetcher(source);
      const current: CapturedDocument = {
        raw: fetched.body,
        metadata: fetched.metadata,
        normalized:
          fetched.metadata.contentType === "text/plain"
            ? normalizeText(fetched.body, {
                sourceUrl: fetched.metadata.finalUrl || source.url,
              })
            : normalizeHtml(fetched.body, {
                sourceUrl: fetched.metadata.finalUrl || source.url,
                ignoreSelectors: source.ignoreSelectors,
              }),
      };
      const fragments =
        previous && previous.normalized.lines.join("\n") !== current.normalized.lines.join("\n")
          ? diffLines(previous.normalized.lines, current.normalized.lines)
          : [];
      const changes = fragments.map((fragment) => classifyFragment(fragment, source.kind));
      const packet = buildEvidencePacket({ source, previous, current, changes });

      await writeEvidencePacket(root, packet);
      await writeMarkdownReport(root, source.id, renderMarkdown(packet));
      await writeBaseline(root, source.id, current);
      packets.push(packet);
    } catch (error) {
      const packet = buildEvidencePacket({
        source,
        status: "failed",
        capturedAt: now().toISOString(),
        error: evidenceError(error),
      });
      await writeEvidencePacket(root, packet);
      await writeMarkdownReport(root, source.id, renderMarkdown(packet));
      packets.push(packet);
    }
  }

  const failed = packets.filter((packet) => packet.status === "failed").length;
  return {
    packets,
    succeeded: packets.length - failed,
    failed,
  };
}
