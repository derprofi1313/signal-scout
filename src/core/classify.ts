import type { ChangeCategory, ClassifiedChange, DiffFragment, Priority, SourceKind } from "./types";

interface ClassificationContext {
  before: string;
  after: string;
  combined: string;
  kind: SourceKind;
}

interface ClassificationRule {
  matches: (context: ClassificationContext) => boolean;
  category: ChangeCategory;
  priority: Priority;
  score: number;
  reason: string;
}

const pricePattern =
  /(?:[$€£]\s?\d|\b\d+(?:[.,]\d{1,2})?\s?(?:usd|eur|gbp)\b|\bper\s+(?:user|seat|workspace|month|year)\b|\bmonthly\b|\bannually\b)/i;
const packageNamePattern =
  /\b(?:free|basic|starter|launch|growth|pro|professional|team|business|premium|enterprise)\b/i;
const productPattern =
  /\b(?:api|feature|integration|project|release|support|workspace|workflow|automation|dashboard)\b/i;
const policyPattern =
  /\b(?:privacy|terms|policy|security|compliance|gdpr|soc\s?2|iso\s?27001|data processing)\b/i;
const positioningPattern =
  /\b(?:built for|designed for|the platform for|all-in-one|mission|positioning|ideal for)\b/i;

function changedMatch(pattern: RegExp, context: ClassificationContext): boolean {
  return pattern.test(context.before) && pattern.test(context.after);
}

const rules: readonly ClassificationRule[] = [
  {
    matches: (context) => changedMatch(pricePattern, context),
    category: "pricing",
    priority: "high",
    score: 90,
    reason: "Published price changed",
  },
  {
    matches: (context) => context.kind === "pricing" && changedMatch(packageNamePattern, context),
    category: "packaging",
    priority: "high",
    score: 80,
    reason: "Plan or package name changed",
  },
  {
    matches: (context) => pricePattern.test(context.combined),
    category: "pricing",
    priority: "high",
    score: 85,
    reason: "Published price added or removed",
  },
  {
    matches: (context) => context.kind === "policy" || policyPattern.test(context.combined),
    category: "policy",
    priority: "high",
    score: 75,
    reason: "Published policy or compliance language changed",
  },
  {
    matches: (context) =>
      context.kind === "changelog" ||
      context.kind === "product" ||
      productPattern.test(context.combined),
    category: "product",
    priority: "medium",
    score: 60,
    reason: "Product or feature update published",
  },
  {
    matches: (context) =>
      context.kind === "positioning" || positioningPattern.test(context.combined),
    category: "positioning",
    priority: "medium",
    score: 50,
    reason: "Published positioning language changed",
  },
  {
    matches: () => true,
    category: "general",
    priority: "low",
    score: 25,
    reason: "General page copy changed",
  },
];

export function classifyFragment(fragment: DiffFragment, kind: SourceKind): ClassifiedChange {
  const context: ClassificationContext = {
    before: fragment.before.join("\n"),
    after: fragment.after.join("\n"),
    combined: [...fragment.before, ...fragment.after].join("\n"),
    kind,
  };
  const rule = rules.find((candidate) => candidate.matches(context)) ?? rules.at(-1)!;

  return {
    ...fragment,
    category: rule.category,
    priority: rule.priority,
    score: rule.score,
    reasons: [rule.reason],
  };
}
