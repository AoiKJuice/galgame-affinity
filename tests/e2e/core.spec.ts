import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("本地模型、作品库搜索、评分与推荐流程", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "安装演示模型" }).click();
  await expect(page.getByRole("heading", { name: "建立本地资料" })).toBeVisible();

  await page.getByRole("button", { name: "进入 GAL鉴赏" }).click();
  await expect(page.getByRole("heading", { name: "本地资料" })).toBeVisible();

  for (const [title, score] of [["CLANNAD", "10"], ["Little Busters", "9"], ["Summer Pockets", "9"], ["Kanon", "8"], ["AIR", "8"]]) {
    const search = page.getByRole("textbox", { name: "搜索完整作品库并添加" });
    await search.fill(title);
    await page.locator(".search-results button").first().click();
    await page.locator(".dialog input[type=number]").fill(score);
    await page.getByRole("button", { name: "添加作品" }).click();
  }

  await page.getByRole("button", { name: "作品库", exact: true }).click();
  await expect(page.locator(".library-card")).toHaveCount(5);
  const cardPositions = await page.locator(".library-card").evaluateAll((cards) => cards.map((card) => ({ x: card.getBoundingClientRect().x, y: card.getBoundingClientRect().y })));
  expect(Math.abs(cardPositions[0].x - cardPositions[4].x)).toBeLessThanOrEqual(1);
  await page.locator(".library-card .card-title-button").first().click();
  await expect(page.locator(".detail-page")).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();

  await page.getByRole("button", { name: "推荐", exact: true }).click();
  await page.getByRole("button", { name: /生成|计算/ }).first().click();
  await expect(page.locator(".recommendation-card").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "隐藏续作" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "隐藏衍生作与后日谈" })).toHaveAttribute("aria-pressed", "true");

  await page.locator(".recommendation-card h3 button").first().click();
  await expect(page.locator(".detail-page")).toBeVisible();
  await expect(page.locator(".detail-score-panel")).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();

  const firstTitle = await page.locator(".recommendation-card h3").first().textContent();
  await page.getByRole("button", { name: "不感兴趣" }).first().click();
  await expect(page.getByRole("button", { name: "撤回" })).toBeVisible();
  await expect(page.locator(".recommendation-card h3").first()).not.toHaveText(firstTitle || "");
  await page.getByRole("button", { name: "撤回" }).click();
  await expect(page.locator(".recommendation-card h3").filter({ hasText: firstTitle || "" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
