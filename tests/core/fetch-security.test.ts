import { describe, expect, it } from "vitest";

import { fetchSource } from "@/core/fetch";
import type { HostResolver, HopResponse, PinnedRequest, SignalScoutSource } from "@/core/types";

function source(url: string): SignalScoutSource {
  return {
    id: "competitor",
    name: "Competitor",
    url,
    kind: "general",
    ignoreSelectors: [],
  };
}

function response(
  statusCode: number,
  headers: Record<string, string>,
  body: string | null = null,
): HopResponse {
  const webResponse = new Response(body);
  return {
    statusCode,
    statusMessage: statusCode === 200 ? "OK" : "Found",
    headers: new Headers(headers),
    body: webResponse.body,
    cancel: () => webResponse.body?.cancel(),
  };
}

describe("public-only capture routing", () => {
  it("rejects a hostname when DNS returns no usable address", async () => {
    let requested = false;
    const requestImpl: PinnedRequest = async () => {
      requested = true;
      return response(200, { "content-type": "text/plain" }, "Evidence");
    };

    await expect(
      fetchSource(source("https://empty.example/pricing"), {
        resolveHostname: async () => [],
        requestImpl,
      }),
    ).rejects.toMatchObject({
      code: "unsafe_target",
    });
    expect(requested).toBe(false);
  });

  it("rejects a resolved address whose declared family is inconsistent", async () => {
    await expect(
      fetchSource(source("https://mismatch.example/pricing"), {
        resolveHostname: async () => [{ address: "93.184.216.34", family: 6 }],
        requestImpl: async () => response(200, { "content-type": "text/plain" }, "Evidence"),
      }),
    ).rejects.toMatchObject({
      code: "unsafe_target",
    });
  });

  it("rejects an IPv4-mapped private IPv6 target", async () => {
    await expect(
      fetchSource(source("http://[::ffff:127.0.0.1]/metadata"), {
        fetchImpl: async () =>
          new Response("secret", { headers: { "content-type": "text/plain" } }),
      }),
    ).rejects.toMatchObject({
      code: "unsafe_target",
    });
  });

  it("rejects a public hostname when any resolved address is private", async () => {
    const resolveHostname: HostResolver = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ];

    await expect(
      fetchSource(source("https://public.example/pricing"), {
        resolveHostname,
        fetchImpl: async () =>
          new Response("secret", { headers: { "content-type": "text/plain" } }),
      }),
    ).rejects.toMatchObject({
      code: "unsafe_target",
    });
  });

  it("validates a redirect destination before requesting it", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      requested.push(String(input));
      return new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      });
    };

    await expect(
      fetchSource(source("https://public.example/pricing"), { fetchImpl }),
    ).rejects.toMatchObject({
      code: "unsafe_target",
    });
    expect(requested).toEqual(["https://public.example/pricing"]);
  });

  it("rejects a redirect loop deterministically", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      return new Response(null, {
        status: 302,
        headers: { location: url.pathname === "/one" ? "/two" : "/one" },
      });
    };

    await expect(
      fetchSource(source("https://public.example/one"), { fetchImpl }),
    ).rejects.toMatchObject({
      code: "redirect_loop",
    });
  });

  it("reports a redirect without a Location header as an HTTP error", async () => {
    await expect(
      fetchSource(source("https://public.example/pricing"), {
        fetchImpl: async () => new Response(null, { status: 302, statusText: "Found" }),
      }),
    ).rejects.toMatchObject({
      name: "CaptureError",
      code: "http_status",
      message: "Capture returned HTTP 302 Found",
    });
  });

  it("follows at most five redirects", async () => {
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requested.push(url.pathname);
      const hop = Number(url.pathname.slice("/hop-".length));
      return new Response(null, {
        status: 302,
        headers: { location: `/hop-${hop + 1}` },
      });
    };

    await expect(
      fetchSource(source("https://public.example/hop-0"), { fetchImpl }),
    ).rejects.toMatchObject({
      code: "redirect_limit",
    });
    expect(requested).toEqual(["/hop-0", "/hop-1", "/hop-2", "/hop-3", "/hop-4", "/hop-5"]);
  });

  it("pins the validated address into the request lookup", async () => {
    const resolveHostname: HostResolver = async () => [{ address: "93.184.216.34", family: 4 }];
    let connectedAddress: string | undefined;
    let connectedFamily: number | undefined;
    let requestedHostname: string | undefined;
    const requestImpl: PinnedRequest = async (url, options) => {
      requestedHostname = url.hostname;
      await new Promise<void>((resolve, reject) => {
        options.lookup(
          url.hostname,
          { all: false, family: 0, hints: 0 },
          (error, address, family) => {
            if (error) {
              reject(error);
              return;
            }
            connectedAddress = typeof address === "string" ? address : address[0]?.address;
            connectedFamily = family;
            resolve();
          },
        );
      });
      return response(200, { "content-type": "text/plain" }, "Evidence");
    };

    const result = await fetchSource(source("https://public.example/pricing"), {
      resolveHostname,
      requestImpl,
      fetchImpl: async () => {
        throw new Error("The fetch testing seam must not bypass pinned request routing");
      },
      now: () => new Date("2026-07-25T10:00:00.000Z"),
    });

    expect(result.body).toBe("Evidence");
    expect(requestedHostname).toBe("public.example");
    expect(connectedAddress).toBe("93.184.216.34");
    expect(connectedFamily).toBe(4);
  });

  it("accepts a public IPv6 target and pins its family for all-address lookup", async () => {
    const publicIpv6 = "2606:4700:4700::1111";
    let pinnedAddresses: Array<{ address: string; family: number }> = [];
    const requestImpl: PinnedRequest = async (url, options) => {
      await new Promise<void>((resolve, reject) => {
        options.lookup(url.hostname, { all: true, family: 0, hints: 0 }, (error, addresses) => {
          if (error) {
            reject(error);
            return;
          }
          pinnedAddresses = typeof addresses === "string" ? [] : addresses;
          resolve();
        });
      });
      return response(200, { "content-type": "text/plain" }, "IPv6 evidence");
    };

    const result = await fetchSource(source("https://ipv6.example/pricing"), {
      resolveHostname: async () => [{ address: publicIpv6, family: 6 }],
      requestImpl,
      now: () => new Date("2026-07-25T10:00:00.000Z"),
    });

    expect(result.body).toBe("IPv6 evidence");
    expect(pinnedAddresses).toEqual([{ address: publicIpv6, family: 6 }]);
  });
});
