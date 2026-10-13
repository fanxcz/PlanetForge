import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openReadyWorld(page) {
  await page.goto("/");
  await expect(page.locator("#statusText")).toContainText("Мир сформирован", { timeout: 60_000 });
}

test("switching to map hides the globe instead of drawing both views", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await openReadyWorld(page);
  await page.locator('.view-tab[data-view="map"]').click();
  await expect(page.locator("#mapCanvas")).toBeVisible();
  await expect(page.locator("#planetCanvas")).toBeHidden();
  await expect(page.locator("#globe3dCanvas")).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("terrain brush persists edits and Undo/Redo restores them", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await openReadyWorld(page);
  await page.locator("#terrainEditorDetails summary").click();
  await page.locator("#editTerrain").check();
  const canvas = page.locator("#mapCanvas");
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-terrain-editing","true");
  await expect(page.locator("#editTerrain")).toBeChecked();
  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const x = rect.x + rect.width * 0.52;
  const y = rect.y + rect.height * 0.52;
  const hitTarget=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,{x,y});
  expect(hitTarget).toBe("mapCanvas");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute("data-terrain-pointer-started","true");
  await page.mouse.move(x + 42, y + 10, {steps:8});
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem("planetforge.autosave.v1") || "null");
    return Object.keys(project?.customHeightOverrides || {}).length;
  }), {timeout:60_000}).toBeGreaterThan(0);
  await page.locator("#undoBtn").click();
  await expect.poll(async () => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem("planetforge.autosave.v1") || "null");
    return Object.keys(project?.customHeightOverrides || {}).length;
  }), {timeout:60_000}).toBe(0);
  await page.locator("#redoBtn").click();
  await expect.poll(async () => page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem("planetforge.autosave.v1") || "null");
    return Object.keys(project?.customHeightOverrides || {}).length;
  }), {timeout:60_000}).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test("search and categories filter the built-in world catalog", async ({ page }) => {
  await openReadyWorld(page);
  await page.locator("#galleryBtn").click();
  await expect(page.locator("#galleryResultsSummary")).toHaveText("12 из 12 миров");
  await page.locator("#gallerySearch").fill("Nivara");
  await expect(page.locator("#galleryResultsSummary")).toHaveText("1 из 12 миров");
  await expect(page.locator("#galleryWorldsList .gallery-card")).toHaveCount(1);
  await page.locator("#gallerySearch").fill("");
  await page.locator("#galleryCategory").selectOption("Volcanic");
  await expect(page.locator("#galleryWorldsList .gallery-card")).toHaveCount(2);
});

test("local library keeps numbered snapshots and supports search", async ({ page }) => {
  await openReadyWorld(page);
  await page.locator("#saveWorldBtn").click();
  await page.locator("#saveWorldBtn").click();
  await page.locator("#savedWorldsBtn").click();
  await expect(page.locator("#savedWorldsList .saved-item")).toHaveCount(2);
  await expect(page.locator("#savedWorldsList")).toContainText("v2");
  await page.locator("#savedSearch").fill("v1");
  await expect(page.locator("#savedWorldsList .saved-item")).toHaveCount(1);
  await expect(page.locator("#savedWorldsList")).toContainText("v1");
});

test("ZIP download includes the game's height, normal, biome and water-mask assets", async ({ page }) => {
  await openReadyWorld(page);
  await page.locator("#exportBtn").click();
  const downloadPromise = page.waitForEvent("download", { timeout:120_000 });
  await page.locator('[data-export="zip"]').click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const bytes = await readFile(filePath);
  expect(bytes[0]).toBe(0x50);
  expect(bytes[1]).toBe(0x4b);
  const zipNames = bytes.toString("latin1");
  for (const filename of [
    "planetforge-manifest.json","heightmap16.raw","normal-map.png",
    "biome-index.png","land-water-mask.png","biome.png","political.png"
  ]) expect(zipNames).toContain(filename);
});

test("mobile layout has readable bottom navigation and no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReadyWorld(page);
  const nav = page.locator("#mobileNav");
  await expect(nav).toBeVisible();
  await expect(page.locator("#planetStage")).toBeVisible();
  const layout = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    navHeight: document.querySelector("#mobileNav").getBoundingClientRect().height,
    buttonHeight: document.querySelector('#mobileNav [data-mobile-view="world"]').getBoundingClientRect().height
  }));
  expect(layout.horizontalOverflow).toBe(false);
  expect(layout.navHeight).toBeGreaterThanOrEqual(60);
  expect(layout.buttonHeight).toBeGreaterThanOrEqual(48);

  await page.locator('#mobileNav [data-mobile-view="settings"]').click();
  await expect(page.locator(".left-sidebar")).toBeVisible();
  await expect(page.locator(".viewport-column")).toBeHidden();
  await expect(page.locator('#mobileNav [data-mobile-view="settings"]')).toHaveAttribute("aria-pressed", "true");

  await page.locator('#mobileNav [data-mobile-view="data"]').click();
  await expect(page.locator(".right-sidebar")).toBeVisible();
  await expect(page.locator(".left-sidebar")).toBeHidden();
  await expect(page.locator("#landStat")).toBeVisible();

  await page.locator('#mobileNav [data-mobile-view="world"]').click();
  await expect(page.locator(".planet-stage")).toBeVisible();
  await expect(page.locator(".left-sidebar")).toBeHidden();
  await expect(page.locator(".right-sidebar")).toBeHidden();
});
