import type { FetchResult, SignalScoutSource } from "./types";

const CAPTURE_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "SignalScout/0.1 (+https://github.com/derprofi1313/signal-scout)";
const acceptedContentTypes = new Set(["text/html", "application/xhtml+xml", "text/plain"]);

export interface FetchSourceOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class CaptureError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CaptureError";
    this.code = code;
  }
}

function contentTypeOf(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

async function readGuardedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new CaptureError(
      "body_too_large",
      `Response body exceeds the ${MAX_BODY_BYTES} byte limit`,
    );
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new CaptureError(
        "body_too_large",
        `Response body exceeds the ${MAX_BODY_BYTES} byte limit`,
      );
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function fetchSource(
  source: SignalScoutSource,
  options: FetchSourceOptions = {},
): Promise<FetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  try {
    const response = await fetchImpl(source.url, {
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new CaptureError(
        "http_status",
        `Capture returned HTTP ${response.status} ${response.statusText}`.trim(),
      );
    }

    const contentType = contentTypeOf(response);
    if (!acceptedContentTypes.has(contentType)) {
      throw new CaptureError(
        "unsupported_content_type",
        `Unsupported content type "${contentType || "missing"}"`,
      );
    }

    const bytes = await readGuardedBody(response);
    return {
      body: new TextDecoder("utf-8").decode(bytes),
      metadata: {
        capturedAt: now().toISOString(),
        requestedUrl: source.url,
        finalUrl: response.url || source.url,
        statusCode: response.status,
        contentType,
        bytes: bytes.byteLength,
      },
    };
  } catch (error) {
    if (error instanceof CaptureError) {
      throw error;
    }
    if (isTimeoutError(error)) {
      throw new CaptureError("timeout", `Capture timed out after ${CAPTURE_TIMEOUT_MS} ms`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new CaptureError("network_error", `Capture failed: ${message}`);
  }
}
