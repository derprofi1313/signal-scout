import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { demoPacket } from "@/data/demo-packet";

test("makes the evidence chain inspectable", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Markets move\.\s*Your evidence shouldn’t\./,
    }),
  ).toBeVisible();
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();

  await page.getByRole("link", { name: "Inspect the evidence" }).click();

  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByText("Synthetic fixture", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Two changes. No interpretive fog.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Showing 2 of 2 fixture changes.")).toBeAttached();
  await expect(page.getByText("Published price changed", { exact: true })).toBeVisible();
});

test("derives the landing specimen from the checked demo packet", async ({ page }) => {
  const currentHash = demoPacket.hashes.current?.normalized;
  const pricingChange = demoPacket.changes.find((change) => change.category === "pricing");
  expect(currentHash).toBeTruthy();
  expect(pricingChange).toBeTruthy();

  await page.goto("/");

  const chain = page.getByLabel("Chain of evidence");
  await expect(
    chain.getByText(`sha256: ${currentHash!.slice(0, 4)}…${currentHash!.slice(-4)}`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    chain.getByText(`${pricingChange!.before[0]} → ${pricingChange!.after[0]}`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    chain.getByText(
      `${pricingChange!.priority[0]!.toUpperCase()}${pricingChange!.priority.slice(1)} · ${pricingChange!.category}`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(chain.getByText(pricingChange!.reasons[0]!, { exact: true })).toBeVisible();
});

test("makes Git tracking an explicit opt-in", async ({ page }) => {
  await page.goto("/");

  const commandSequence = page.getByLabel("Signal Scout command sequence");
  await expect(commandSequence).toContainText("git add -f .signal-scout");
  await expect(commandSequence).toContainText("git diff --cached -- .signal-scout");
});

test("operates the evidence filters from the keyboard", async ({ page }) => {
  await page.goto("/demo");

  const allFilter = page.getByRole("button", { name: "All changes" });
  const pricingFilter = page.getByRole("button", { name: "Pricing" });

  await allFilter.focus();
  await page.keyboard.press("Tab");
  await expect(pricingFilter).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(pricingFilter).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Published price changed", { exact: true })).toBeVisible();
  await expect(page.getByText("Product or feature update published", { exact: true })).toBeHidden();
});

test("contains the evidence desk at 320 CSS pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });

  for (const route of ["/", "/demo"]) {
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${route} should not overflow horizontally`).toBeLessThanOrEqual(0);
  }
});

test("removes the chain marker animation when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const marker = page.locator("[data-chain-marker]").first();
  await expect(marker).toBeVisible();
  await expect
    .poll(() => marker.evaluate((element) => getComputedStyle(element).animationName))
    .toBe("none");
});

test("meets the automated WCAG 2.2 AA baseline", async ({ page }) => {
  for (const route of ["/", "/demo"]) {
    await page.goto(route);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(results.violations, `${route} accessibility violations`).toEqual([]);
  }
});
