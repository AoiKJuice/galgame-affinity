import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("本地模型、片库搜索、评分与推荐流程", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "安装演示模型" }).click();
  await expect(page.getByRole("heading", { name: "建立本地资料" })).toBeVisible();

  await page.getByLabel("资料名称").fill("测试资料");
  await page.getByRole("button", { name: "进入游鉴" }).click();
  await expect(page.getByRole("heading", { name: "测试资料" })).toBeVisible();

  for (const [title, score] of [["CLANNAD", "10"], ["Little Busters", "9"], ["Summer Pockets", "9.5"]]) {
    const search = page.getByRole("textbox", { name: "搜索全部 Galgame" });
    await search.fill(title);
    await page.locator(".search-results button").first().click();
    await page.locator(".dialog input[type=number]").fill(score);
    await page.getByRole("button", { name: "保存" }).click();
  }

  await page.getByRole("button", { name: "推荐", exact: true }).click();
  await page.getByRole("button", { name: /生成|计算/ }).first().click();
  await expect(page.locator(".recommendation-card").first()).toBeVisible();

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
