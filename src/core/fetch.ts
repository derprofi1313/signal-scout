import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

import type {
  FetchResult,
  HopResponse,
  HostResolver,
  PinnedRequest,
  ResolvedAddress,
  SignalScoutSource,
} from "./types";

const CAPTURE_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT = "SignalScout/0.1 (+https://github.com/derprofi1313/signal-scout)";
const acceptedContentTypes = new Set(["text/html", "application/xhtml+xml", "text/plain"]);
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const INVALID_UTF8_LIMITATION =
  "Response bytes were not valid UTF-8; replacement characters were inserted during decoding.";

export interface FetchSourceOptions {
  fetchImpl?: typeof fetch;
  resolveHostname?: HostResolver;
  requestImpl?: PinnedRequest;
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

function contentTypeOf(response: HopResponse): string {
  return (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function unsafeTarget(message: string): CaptureError {
  return new CaptureError("unsafe_target", message);
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    value = value * 256 + octet;
  }
  return value;
}

function isInIpv4Cidr(value: number, base: number, prefixLength: number): boolean {
  const blockSize = 2 ** (32 - prefixLength);
  return Math.floor(value / blockSize) === Math.floor(base / blockSize);
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  if (value === null) {
    return false;
  }

  const blockedCidrs: readonly [string, number][] = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.31.196.0", 24],
    ["192.52.193.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["192.175.48.0", 24],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];

  return !blockedCidrs.some(([base, prefixLength]) => {
    const baseValue = ipv4ToNumber(base);
    return baseValue !== null && isInIpv4Cidr(value, baseValue, prefixLength);
  });
}

function ipv6ToBigInt(address: string): bigint | null {
  const normalized = stripIpv6Brackets(address).toLowerCase();
  if (!normalized || normalized.includes("%") || normalized.split("::").length > 2) {
    return null;
  }

  let expanded = normalized;
  const ipv4Tail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (ipv4Tail) {
    const ipv4Value = ipv4ToNumber(ipv4Tail);
    if (ipv4Value === null) {
      return null;
    }
    const high = ((ipv4Value >>> 16) & 0xffff).toString(16);
    const low = (ipv4Value & 0xffff).toString(16);
    expanded = `${normalized.slice(0, -ipv4Tail.length)}${high}:${low}`;
  }

  const [leftText, rightText] = expanded.split("::");
  const left = leftText ? leftText.split(":") : [];
  const right = rightText ? rightText.split(":") : [];
  if (
    [...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part)) ||
    (rightText === undefined && left.length !== 8)
  ) {
    return null;
  }

  const missing = 8 - left.length - right.length;
  if (missing < (rightText === undefined ? 0 : 1)) {
    return null;
  }
  const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  if (groups.length !== 8) {
    return null;
  }

  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function isInIpv6Cidr(value: bigint, base: bigint, prefixLength: number): boolean {
  const shift = 128n - BigInt(prefixLength);
  return value >> shift === base >> shift;
}

function isPublicIpv6(address: string): boolean {
  const value = ipv6ToBigInt(address);
  if (value === null) {
    return false;
  }

  // IPv4-mapped IPv6 must inherit all IPv4 safety checks.
  if (value >> 32n === 0xffffn) {
    const ipv4Value = Number(value & 0xffff_ffffn);
    const ipv4Address = [
      Math.floor(ipv4Value / 2 ** 24),
      Math.floor(ipv4Value / 2 ** 16) % 256,
      Math.floor(ipv4Value / 2 ** 8) % 256,
      ipv4Value % 256,
    ].join(".");
    return isPublicIpv4(ipv4Address);
  }

  // Only global unicast is eligible, with IANA special-purpose ranges excluded.
  const globalUnicast = ipv6ToBigInt("2000::");
  const ietfAssignments = ipv6ToBigInt("2001::");
  const documentation = ipv6ToBigInt("2001:db8::");
  const sixToFour = ipv6ToBigInt("2002::");
  const documentationV2 = ipv6ToBigInt("3fff::");
  if (
    globalUnicast === null ||
    ietfAssignments === null ||
    documentation === null ||
    sixToFour === null ||
    documentationV2 === null ||
    !isInIpv6Cidr(value, globalUnicast, 3)
  ) {
    return false;
  }

  return (
    !isInIpv6Cidr(value, ietfAssignments, 23) &&
    !isInIpv6Cidr(value, documentation, 32) &&
    !isInIpv6Cidr(value, sixToFour, 16) &&
    !isInIpv6Cidr(value, documentationV2, 20)
  );
}

function isPublicAddress(address: string): boolean {
  const family = isIP(stripIpv6Brackets(address));
  return family === 4 ? isPublicIpv4(address) : family === 6 ? isPublicIpv6(address) : false;
}

function assertSafeUrl(url: URL): void {
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
    throw unsafeTarget(`Capture URL must use public HTTP or HTTPS: ${url.href}`);
  }
  if (url.username || url.password) {
    throw unsafeTarget(`Capture URL must not contain credentials: ${url.href}`);
  }
}

function normalizeResolvedAddress(candidate: ResolvedAddress): ResolvedAddress {
  const address = stripIpv6Brackets(candidate.address);
  const actualFamily = isIP(address);
  if (
    (actualFamily !== 4 && actualFamily !== 6) ||
    candidate.family !== actualFamily ||
    !isPublicAddress(address)
  ) {
    throw unsafeTarget(`Capture target resolved to a non-public address: ${candidate.address}`);
  }
  return { address, family: actualFamily };
}

async function defaultHostResolver(hostname: string): Promise<readonly ResolvedAddress[]> {
  const results = await dnsLookup(hostname, { all: true, order: "verbatim" });
  return results.map(({ address, family }) => ({
    address,
    family: family === 6 ? 6 : 4,
  }));
}

async function resolveWithSignal(
  resolver: HostResolver,
  hostname: string,
  signal: AbortSignal,
): Promise<readonly ResolvedAddress[]> {
  if (signal.aborted) {
    throw signal.reason;
  }

  return await new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    resolver(hostname).then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function resolveSafeAddress(
  url: URL,
  resolver: HostResolver,
  signal: AbortSignal,
): Promise<ResolvedAddress> {
  const hostname = stripIpv6Brackets(url.hostname);
  const literalFamily = isIP(hostname);
  const candidates: readonly ResolvedAddress[] =
    literalFamily === 4 || literalFamily === 6
      ? [{ address: hostname, family: literalFamily }]
      : await resolveWithSignal(resolver, hostname, signal);

  if (candidates.length === 0) {
    throw unsafeTarget(`Capture target did not resolve to an address: ${hostname}`);
  }
  const validated = candidates.map(normalizeResolvedAddress);
  return validated[0]!;
}

function createPinnedLookup(pinned: ResolvedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (typeof options === "object" && options.all) {
      callback(null, [{ address: pinned.address, family: pinned.family }]);
      return;
    }
    callback(null, pinned.address, pinned.family);
  };
}

const defaultPinnedRequest: PinnedRequest = async (url, options) => {
  return await new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        agent: false,
        headers: options.headers,
        lookup: options.lookup,
        signal: options.signal,
      },
      (response) => {
        const headers = new Headers();
        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          const name = response.rawHeaders[index];
          const value = response.rawHeaders[index + 1];
          if (name && value !== undefined) {
            headers.append(name, value);
          }
        }
        resolve({
          statusCode: response.statusCode ?? 0,
          statusMessage: response.statusMessage ?? "",
          headers,
          body: response,
          cancel: () => {
            response.destroy();
          },
        });
      },
    );
    request.once("error", reject);
    request.end();
  });
};

function fetchRequest(fetchImpl: typeof fetch): PinnedRequest {
  return async (url, options) => {
    const response = await fetchImpl(url.href, {
      headers: options.headers,
      redirect: "manual",
      signal: options.signal,
    });
    return {
      statusCode: response.status,
      statusMessage: response.statusText,
      headers: response.headers,
      body: response.body,
      cancel: () => response.body?.cancel(),
    };
  };
}

async function readGuardedBody(response: HopResponse): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    await response.cancel();
    throw new CaptureError(
      "body_too_large",
      `Response body exceeds the ${MAX_BODY_BYTES} byte limit`,
    );
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const appendChunk = (chunk: Uint8Array): void => {
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new CaptureError(
        "body_too_large",
        `Response body exceeds the ${MAX_BODY_BYTES} byte limit`,
      );
    }
    chunks.push(chunk);
  };

  if ("getReader" in response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      try {
        appendChunk(value);
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
      }
    }
  } else {
    try {
      for await (const chunk of response.body) {
        appendChunk(chunk);
      }
    } catch (error) {
      await Promise.resolve(response.cancel()).catch(() => undefined);
      throw error;
    }
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function parseCaptureUrl(value: string): URL {
  try {
    const url = new URL(value);
    assertSafeUrl(url);
    return url;
  } catch (error) {
    if (error instanceof CaptureError) {
      throw error;
    }
    throw unsafeTarget(`Invalid capture URL: ${value}`);
  }
}

export async function fetchSource(
  source: SignalScoutSource,
  options: FetchSourceOptions = {},
): Promise<FetchResult> {
  const signal = AbortSignal.timeout(CAPTURE_TIMEOUT_MS);
  const now = options.now ?? (() => new Date());
  const resolver =
    options.resolveHostname ??
    (options.fetchImpl
      ? async () => [{ address: "93.184.216.34", family: 4 }] as const
      : defaultHostResolver);
  const requestImpl =
    options.requestImpl ??
    (options.fetchImpl ? fetchRequest(options.fetchImpl) : defaultPinnedRequest);
  const visited = new Set<string>();
  let currentUrl = parseCaptureUrl(source.url);
  let redirectCount = 0;

  try {
    while (true) {
      if (visited.has(currentUrl.href)) {
        throw new CaptureError("redirect_loop", `Redirect loop detected at ${currentUrl.href}`);
      }
      visited.add(currentUrl.href);

      const pinned = await resolveSafeAddress(currentUrl, resolver, signal);
      const response = await requestImpl(currentUrl, {
        signal,
        headers: { "user-agent": USER_AGENT },
        lookup: createPinnedLookup(pinned),
      });

      if (redirectStatuses.has(response.statusCode)) {
        const location = response.headers.get("location");
        await response.cancel();
        if (!location) {
          throw new CaptureError(
            "http_status",
            `Capture returned HTTP ${response.statusCode} ${response.statusMessage}`.trim(),
          );
        }
        if (redirectCount >= MAX_REDIRECTS) {
          throw new CaptureError(
            "redirect_limit",
            `Capture exceeded the ${MAX_REDIRECTS} redirect limit`,
          );
        }
        redirectCount += 1;
        currentUrl = parseCaptureUrl(new URL(location, currentUrl).href);
        continue;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.cancel();
        throw new CaptureError(
          "http_status",
          `Capture returned HTTP ${response.statusCode} ${response.statusMessage}`.trim(),
        );
      }

      const contentType = contentTypeOf(response);
      if (!acceptedContentTypes.has(contentType)) {
        await response.cancel();
        throw new CaptureError(
          "unsupported_content_type",
          `Unsupported content type "${contentType || "missing"}"`,
        );
      }

      const bytes = await readGuardedBody(response);
      const rawSha256 = createHash("sha256").update(bytes).digest("hex");
      let body: string;
      let limitations: string[] | undefined;
      try {
        body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        body = new TextDecoder("utf-8").decode(bytes);
        limitations = [INVALID_UTF8_LIMITATION];
      }
      return {
        body,
        rawSha256,
        ...(limitations ? { limitations } : {}),
        metadata: {
          capturedAt: now().toISOString(),
          requestedUrl: source.url,
          finalUrl: currentUrl.href,
          statusCode: response.statusCode,
          contentType,
          bytes: bytes.byteLength,
        },
      };
    }
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
