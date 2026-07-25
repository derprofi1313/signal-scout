import type { DiffFragment } from "./types";

const MAX_COMPARISON_LINES = 400;
const CONTEXT_LINES = 2;
const comparisonLimitation =
  "Diff comparison exceeded 400 × 400 lines; a single replacement fragment was emitted.";

type DiffOperation =
  | { type: "equal"; line: string }
  | { type: "remove"; line: string }
  | { type: "add"; line: string };

function commonPrefixLength(before: readonly string[], after: readonly string[]): number {
  const limit = Math.min(before.length, after.length);
  let index = 0;
  while (index < limit && before[index] === after[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(
  before: readonly string[],
  after: readonly string[],
  prefixLength: number,
): number {
  const limit = Math.min(before.length, after.length) - prefixLength;
  let length = 0;
  while (
    length < limit &&
    before[before.length - 1 - length] === after[after.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

function lcsOperations(before: readonly string[], after: readonly string[]): DiffOperation[] {
  const matrix = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));

  for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex -= 1) {
      matrix[beforeIndex]![afterIndex] =
        before[beforeIndex] === after[afterIndex]
          ? matrix[beforeIndex + 1]![afterIndex + 1]! + 1
          : Math.max(matrix[beforeIndex + 1]![afterIndex]!, matrix[beforeIndex]![afterIndex + 1]!);
    }
  }

  const operations: DiffOperation[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < before.length || afterIndex < after.length) {
    if (
      beforeIndex < before.length &&
      afterIndex < after.length &&
      before[beforeIndex] === after[afterIndex]
    ) {
      operations.push({ type: "equal", line: before[beforeIndex]! });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (
      beforeIndex < before.length &&
      (afterIndex === after.length ||
        matrix[beforeIndex + 1]![afterIndex]! >= matrix[beforeIndex]![afterIndex + 1]!)
    ) {
      operations.push({ type: "remove", line: before[beforeIndex]! });
      beforeIndex += 1;
    } else {
      operations.push({ type: "add", line: after[afterIndex]! });
      afterIndex += 1;
    }
  }

  return operations;
}

function operationsToFragments(
  operations: readonly DiffOperation[],
  beforeOffset: number,
  afterOffset: number,
): DiffFragment[] {
  const fragments: DiffFragment[] = [];
  let beforeIndex = beforeOffset;
  let afterIndex = afterOffset;
  let active: DiffFragment | null = null;

  const flush = () => {
    if (active) {
      fragments.push(active);
      active = null;
    }
  };

  for (const operation of operations) {
    if (operation.type === "equal") {
      flush();
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    active ??= {
      before: [],
      after: [],
      beforeStart: beforeIndex,
      afterStart: afterIndex,
    };

    if (operation.type === "remove") {
      active.before.push(operation.line);
      beforeIndex += 1;
    } else {
      active.after.push(operation.line);
      afterIndex += 1;
    }
  }
  flush();

  return fragments;
}

function addBoundedContext(
  fragments: readonly DiffFragment[],
  before: readonly string[],
  after: readonly string[],
): DiffFragment[] {
  return fragments.map((fragment) => {
    const beforeWindowStart = Math.max(0, fragment.beforeStart - CONTEXT_LINES);
    const afterWindowStart = Math.max(0, fragment.afterStart - CONTEXT_LINES);
    const beforeWindowEnd = Math.min(
      before.length,
      fragment.beforeStart + fragment.before.length + CONTEXT_LINES,
    );
    const afterWindowEnd = Math.min(
      after.length,
      fragment.afterStart + fragment.after.length + CONTEXT_LINES,
    );
    const contextWasBounded =
      beforeWindowStart > 0 ||
      afterWindowStart > 0 ||
      beforeWindowEnd < before.length ||
      afterWindowEnd < after.length;

    return contextWasBounded
      ? {
          ...fragment,
          context: {
            before: before.slice(beforeWindowStart, beforeWindowEnd),
            after: after.slice(afterWindowStart, afterWindowEnd),
          },
        }
      : fragment;
  });
}

export function diffLines(before: string[], after: string[]): DiffFragment[] {
  if (before.length === after.length && before.every((line, index) => line === after[index])) {
    return [];
  }

  const prefixLength = commonPrefixLength(before, after);
  const suffixLength = commonSuffixLength(before, after, prefixLength);
  const beforeEnd = before.length - suffixLength;
  const afterEnd = after.length - suffixLength;
  const changedBefore = before.slice(prefixLength, beforeEnd);
  const changedAfter = after.slice(prefixLength, afterEnd);

  if (changedBefore.length > MAX_COMPARISON_LINES || changedAfter.length > MAX_COMPARISON_LINES) {
    return addBoundedContext(
      [
        {
          before: changedBefore,
          after: changedAfter,
          beforeStart: prefixLength,
          afterStart: prefixLength,
          limitations: [comparisonLimitation],
        },
      ],
      before,
      after,
    );
  }

  return addBoundedContext(
    operationsToFragments(lcsOperations(changedBefore, changedAfter), prefixLength, prefixLength),
    before,
    after,
  );
}
