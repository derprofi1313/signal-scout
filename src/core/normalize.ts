import { load } from "cheerio";

import type { NormalizeOptions, NormalizedDocument } from "./types";

const MAX_SEMANTIC_LINES = 800;
const semanticSelector =
  'h1,h2,h3,h4,h5,h6,p,li,dt,dd,th,td,button,[data-price],[itemprop="price"],[aria-label*="price"],[aria-label*="Price"]';
const alwaysIgnoredSelector = 'script,style,noscript,template,svg,nav,footer,[role="navigation"]';

function collapseWhitespace(value: string): string {
  return value.replace(/[\p{Z}\s]+/gu, " ").trim();
}

function resolveCanonicalUrl(
  href: string | undefined,
  sourceUrl: string,
  limitations: string[],
): string {
  if (!href) {
    return sourceUrl;
  }

  try {
    const canonical = new URL(href, sourceUrl);
    if (canonical.protocol !== "http:" && canonical.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return canonical.href;
  } catch {
    limitations.push("The page canonical URL was invalid; the requested URL was retained.");
    return sourceUrl;
  }
}

function normalizedDocument(
  canonicalUrl: string,
  semanticLines: string[],
  limitations: string[],
): NormalizedDocument {
  const originalLineCount = semanticLines.length;
  const lines = semanticLines.slice(0, MAX_SEMANTIC_LINES);
  if (originalLineCount > MAX_SEMANTIC_LINES) {
    limitations.push(
      `Normalized output was truncated from ${originalLineCount} to ${MAX_SEMANTIC_LINES} semantic lines.`,
    );
  }
  return { canonicalUrl, lines, limitations };
}

export function normalizeHtml(html: string, options: NormalizeOptions): NormalizedDocument {
  const $ = load(html);
  const limitations: string[] = [];
  const canonicalHref = $('link[rel~="canonical"]').first().attr("href");

  $(alwaysIgnoredSelector).remove();
  for (const selector of options.ignoreSelectors ?? []) {
    try {
      $(selector).remove();
    } catch {
      limitations.push(`Ignore selector "${selector}" could not be applied.`);
    }
  }

  const semanticLines: string[] = [];
  $(semanticSelector).each((_index, element) => {
    const line = collapseWhitespace($(element).text());
    if (line && semanticLines.at(-1) !== line) {
      semanticLines.push(line);
    }
  });

  return normalizedDocument(
    resolveCanonicalUrl(canonicalHref, options.sourceUrl, limitations),
    semanticLines,
    limitations,
  );
}

export function normalizeText(text: string, options: NormalizeOptions): NormalizedDocument {
  const lines: string[] = [];
  for (const candidate of text.split(/\r?\n/)) {
    const line = collapseWhitespace(candidate);
    if (line && lines.at(-1) !== line) {
      lines.push(line);
    }
  }
  return normalizedDocument(options.sourceUrl, lines, []);
}
