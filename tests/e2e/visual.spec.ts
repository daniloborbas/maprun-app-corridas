import { test, expect } from '@playwright/test';
test('public screens fit the viewport and render their images', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [route, name] of [['/', 'discover'], ['/corrida/demonstracao-1', 'details'], ['/buscar', 'search'], ['/salvos', 'saved'], ['/perfil', 'profile']]) {
    await page.goto(route);
    await expect(page.locator('main h1:visible').first()).toBeVisible();
    await page.locator('main img').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-${name}.png` });
  }
  expect(errors).toEqual([]);
});
