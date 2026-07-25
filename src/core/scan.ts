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
      const storedPrevious = await readBaseline(root, source.id);
      const baselineUrlChanged =
        storedPrevious !== null && storedPrevious.metadata.requestedUrl !== source.url;
      const previous = baselineUrlChanged ? null : storedPrevious;
      const fetched = await fetcher(source);
      if (fetched.metadata.requestedUrl !== source.url) {
        throw new Error("Fetcher returned metadata for a different requested URL");
      }
      const normalized =
        fetched.metadata.contentType === "text/plain"
          ? normalizeText(fetched.body, {
              sourceUrl: fetched.metadata.finalUrl || source.url,
            })
          : normalizeHtml(fetched.body, {
              sourceUrl: fetched.metadata.finalUrl || source.url,
              ignoreSelectors: source.ignoreSelectors,
            });
      const current: CapturedDocument = {
        raw: fetched.body,
        ...(fetched.rawSha256 ? { rawSha256: fetched.rawSha256 } : {}),
        metadata: fetched.metadata,
        normalized: {
          ...normalized,
          limitations: [...normalized.limitations, ...(fetched.limitations ?? [])],
        },
      };
      const fragments =
        previous && previous.normalized.lines.join("\n") !== current.normalized.lines.join("\n")
          ? diffLines(previous.normalized.lines, current.normalized.lines)
          : [];
      const changes = fragments.map((fragment) => classifyFragment(fragment, source.kind));
      const packet = buildEvidencePacket({
        source,
        previous,
        current,
        changes,
        ...(baselineUrlChanged
          ? {
              limitations: [
                "Stored baseline was reset because its requested URL no longer matches the configured source URL.",
              ],
            }
          : {}),
      });

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
      packets.push(packet);

      try {
        await writeEvidencePacket(root, packet);
      } catch (storageError) {
        packet.limitations.push(
          `Failed to persist the failed evidence packet: ${evidenceError(storageError).message}`,
        );
      }

      try {
        await writeMarkdownReport(root, source.id, renderMarkdown(packet));
      } catch (storageError) {
        packet.limitations.push(
          `Failed to persist the failed Markdown report: ${evidenceError(storageError).message}`,
        );
      }
    }
  }

  const failed = packets.filter((packet) => packet.status === "failed").length;
  return {
    packets,
    succeeded: packets.length - failed,
    failed,
  };
}
