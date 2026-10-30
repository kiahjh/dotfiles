import { test, expect, type Page, type Locator } from '@playwright/test';
import { demo } from '../src/demo.ts';
import { loadReview } from '../src/core.ts';
import { capture } from '../src/core.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import palette from '../src/palette.json' with { type: 'json' };

function rgb(hex: string) {
  return `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
}

async function setLayout(page: Page, value: 'auto' | 'split' | 'unified') {
  const label = { auto: 'Auto', split: 'Split', unified: 'Unified' }[value];
  const trigger = page.getByRole('combobox', { name: 'Diff layout' });
  await trigger.click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(trigger).toContainText(label);
}

async function numberTextStarts(card: Locator) {
  const numbers = card.locator('diffs-container [data-code]').first().locator('[data-line-number-content]');
  await numbers.first().waitFor();
  return numbers.evaluateAll(numbers =>
    numbers.filter(number => number.textContent?.trim()).map(number => {
      const range = document.createRange();
      range.selectNodeContents(number);
      return { text: number.textContent!, x: range.getBoundingClientRect().x };
    }));
}

// One progressive review workflow, including a second revision at the end.
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  await demo(1);
  const repo = join(process.env.USER_REVIEW_HOME!, 'range-repository');
  await mkdir(repo);
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
  const text = Array.from({ length: 170 }, (_, i) => `export const number${i + 1} = ${i + 1};`).join('\n') + '\n';
  await writeFile(join(repo, 'ranges.ts'), text);
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base');
  await writeFile(join(repo, 'ranges.ts'), text.replace('number5 = 5', 'number5 = 500')
    .replace('number55 = 55;', `number55 = 5500; // ${'A long source line to test wrapping. '.repeat(30)}`));
  await capture({ repo, id: 'ranges' });
  await writeFile(join(repo, 'ranges.ts'), text.replace('number155 = 155', 'number155 = 15500'));
  await capture({ repo, id: 'hundreds' });
});

test('renders every captured unit with highlighted code and no runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/reviews/demo');
  await expect(page.getByRole('heading', { name: 'Restore sessions without losing your place' })).toBeVisible();
  const data = await loadReview('demo');
  await expect(page.locator('[data-unit-id]')).toHaveCount(data.snapshot.units.length);
  await expect(page.locator('diffs-container').first().locator('[data-line]').first()).toBeVisible();
  await expect(page.locator('diffs-container').first().locator('[data-line] span').first()).toHaveCSS('color', /rgb/);
  await expect(page.locator('diffs-container').first().locator('[data-diff-type="split"]')).toBeVisible();
  const codeLine = page.locator('diffs-container [data-line]').first();
  await expect(codeLine).toHaveCSS('font-family', /Maple Mono NF CN/);
  await expect(codeLine).toHaveCSS('font-feature-settings', /"liga"(?: 1)?/);
  await expect(codeLine).toHaveCSS('font-feature-settings', /"calt"(?: 1)?/);
  await expect(page.getByRole('button', { name: 'Toggle files' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('complementary', { name: 'Changed files' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Wrap lines', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect((await page.locator('diffs-container').first().boundingBox())!.y).toBeLessThan(210);
  const heading = page.locator('.chapter-heading').first();
  const titleBox = (await heading.locator('h2').boundingBox())!;
  const descriptionBox = (await heading.locator('p').boundingBox())!;
  expect(descriptionBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
  expect(descriptionBox.x).toBe(titleBox.x);
  await expect(page.locator('.review-card').first()).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.card-heading').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const radii = await page.locator('.review-toggle').first().evaluate(button => {
    const outer = getComputedStyle(button);
    const inner = getComputedStyle(button.querySelector('.checkbox')!);
    return { outer: parseFloat(outer.borderRadius), inset: parseFloat(outer.padding), inner: parseFloat(inner.borderRadius) };
  });
  expect(radii.inner).toBe(radii.outer - radii.inset);
  await expect(page.locator('.brand, .navigation, .review-end, .card-footer, .context-hint')).toHaveCount(0);
  await expect(page.getByText('Your perspective', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  await expect(page.locator('diffs-container [data-error-wrapper]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
});

test('collapsed items have a subtle background while expanded diffs stay flat', async ({ page }) => {
  await page.goto('/reviews/demo');
  const card = page.locator('[data-unit-id]').first();
  const filename = card.locator('.card-file code');
  const before = (await filename.boundingBox())!;
  await card.getByRole('button', { name: 'Collapse src/session.ts', exact: true }).click();
  await expect(card).toHaveClass(/is-collapsed/);
  await expect(card.locator('.card-body')).toHaveCount(0);
  await expect(card.locator('.card-heading')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(card.locator('.card-heading')).toHaveCSS('border-radius', '12px');
  await expect(card).toHaveCSS('border-top-width', '0px');
  const collapsed = (await filename.boundingBox())!;
  expect(collapsed.x).toBe(before.x);
  expect(collapsed.y).toBe(before.y);
  const geometry = await card.evaluate(element => {
    const heading = element.querySelector('.card-heading')!;
    const button = element.querySelector('.collapse-toggle')!;
    return { outer: parseFloat(getComputedStyle(heading).borderRadius), inner: parseFloat(getComputedStyle(button).borderRadius),
      inset: button.getBoundingClientRect().x - heading.getBoundingClientRect().x };
  });
  expect(geometry.inner).toBe(geometry.outer - geometry.inset);
  await card.getByRole('button', { name: 'Expand src/session.ts', exact: true }).click();
  await expect(card).not.toHaveClass(/is-collapsed/);
  await expect(card.locator('.card-heading')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(card.locator('diffs-container [data-line]').first()).toBeVisible();
});

test('headings, chrome, and renderers share the Kiahgawa palette', async ({ page }) => {
  await page.goto('/reviews/demo');
  const installed = await page.evaluate(() => Object.fromEntries(
    [...document.documentElement.style].map(name => [name.slice(2), document.documentElement.style.getPropertyValue(name)]),
  ));
  const { name, ...colors } = palette;
  expect(installed).toEqual(colors);
  await expect(page.locator('body')).toHaveCSS('background-color', rgb(palette.background));
  await expect(page.locator('body')).toHaveCSS('color', rgb(palette.foreground));
  await expect(page.locator('.topbar')).toHaveCSS('background-color', rgb(palette.panel));
  for (const heading of await page.locator('.chapter-heading').all()) {
    await expect(heading).toHaveCSS('background-color', rgb(palette.panel));
    await expect(heading.locator('h2')).toHaveCSS('color', rgb(palette.yellow));
  }
  await expect(page.locator('.chapter-heading p').first()).toHaveCSS('color', rgb(palette.foreground));
  const code = page.locator('diffs-container').first();
  await expect(code).toHaveCSS('--diffs-addition-color-override', palette.green);
  await expect(code).toHaveCSS('--diffs-deletion-color-override', palette.red);
  await expect(code).toHaveCSS('--diffs-modified-color-override', palette.blue);
  await page.getByRole('button', { name: 'Toggle files' }).click();
  await expect(page.locator('.files-panel')).toHaveCSS('background-color', rgb(palette.panel));
  await expect(page.locator('.modified-tree')).toHaveCSS('--trees-accent-override', palette.yellow);
  await expect(page.locator('.modified-tree')).toHaveCSS('--trees-selected-bg-override', palette.selection);
});

test('chapter copy and visible line numbers align with the leading file icon', async ({ page }) => {
  await page.goto('/reviews/demo');
  for (const width of [1550, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const chapter = page.locator('.chapter').first();
    const card = chapter.locator('.review-card').first();
    const icon = (await card.locator('.file-type-icon').boundingBox())!;
    expect((await chapter.locator('h2').boundingBox())!.x).toBe(icon.x);
    expect((await chapter.locator('.chapter-heading p').boundingBox())!.x).toBe(icon.x);
    for (const number of await numberTextStarts(card)) expect(Math.abs(number.x - icon.x)).toBeLessThan(1);
    await expect(chapter).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(chapter).toHaveCSS('border-radius', '12px');
    await expect(chapter).toHaveCSS('border-top-width', '1px');
    const background = await chapter.evaluate(element => getComputedStyle(element).backgroundColor);
    const heading = chapter.locator('.chapter-heading');
    await expect(heading).not.toHaveCSS('background-color', background);
    await expect(heading).toHaveCSS('border-bottom-width', '1px');
    for (const selector of ['[data-code]', '[data-content]', '[data-gutter]', '[data-line-type="context"][data-line]', '[data-line-type="context"][data-column-number]']) {
      await expect(card.locator(`diffs-container ${selector}`).first()).toHaveCSS('background-color', background);
    }
    await expect(card.locator('diffs-container [data-line-type="change-addition"][data-line]').first()).not.toHaveCSS('background-color', background);
    const main = (await page.locator('.review-content').boundingBox())!;
    const chapterBox = (await chapter.boundingBox())!;
    const headingBox = (await heading.boundingBox())!;
    expect(headingBox.x).toBe(chapterBox.x + 1);
    expect(headingBox.x + headingBox.width).toBe(chapterBox.x + chapterBox.width - 1);
    expect(chapterBox.x).toBeGreaterThan(main.x);
    expect(chapterBox.x + chapterBox.width).toBeLessThan(main.x + main.width);
    const storage = page.locator('[data-unit-id]').filter({ hasText: 'src/storage.ts' }).first();
    expect((await storage.locator('.card-explanation').boundingBox())!.x).toBe((await storage.locator('.file-type-icon').boundingBox())!.x);
    for (const number of await numberTextStarts(storage)) expect(Math.abs(number.x - icon.x)).toBeLessThan(1);
    await expect(storage.locator('.card-explanation')).toHaveCSS('font-size', '13px');
    await expect(chapter.locator('.chapter-heading p')).toHaveCSS('font-size', '13px');
    await page.screenshot({ path: `test-results/chapters-${width}.png` });
  }
});

test('visible line-number text stays aligned for three-digit source ranges', async ({ page }) => {
  await page.goto('/reviews/hundreds');
  for (const width of [1550, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const card = page.locator('[data-unit-id]').first();
    await expect(card.locator('diffs-container [data-line="155"]').first()).toBeVisible();
    const icon = (await card.locator('.file-type-icon').boundingBox())!;
    const numbers = await numberTextStarts(card);
    expect(numbers.some(number => number.text === '155')).toBe(true);
    for (const number of numbers) expect(Math.abs(number.x - icon.x)).toBeLessThan(1);
  }
});

test('file headers use the same file-type icons as the tree without shifting text on collapse', async ({ page }) => {
  await page.goto('/reviews/demo');
  const cases = ['src/session.ts', 'src/SessionTabs.tsx', 'assets/tabs.svg', 'docs/restoration.md', 'assets/state.bin'];
  const icons: string[] = [];
  for (const path of cases) {
    const card = page.locator('[data-unit-id]').filter({ hasText: path }).first();
    const icon = card.locator('.file-type-icon');
    await expect(icon).toBeVisible();
    const href = (await icon.locator('use').getAttribute('href'))!;
    expect(await page.locator(href).count()).toBe(1);
    icons.push(href);
    const nameX = (await card.locator('.card-file code').boundingBox())!.x;
    const iconBox = (await icon.boundingBox())!;
    expect(nameX - iconBox.x - iconBox.width).toBe(4);
    const collapseBox = (await card.locator('.collapse-toggle').boundingBox())!;
    expect(iconBox.x).toBeGreaterThanOrEqual(collapseBox.x + collapseBox.width);
    await card.locator('.collapse-toggle').click();
    expect((await card.locator('.card-file code').boundingBox())!.x).toBe(nameX);
    await expect(icon).toBeVisible();
  }
  expect(new Set(icons).size).toBe(cases.length);
  await page.getByRole('button', { name: 'Toggle files' }).click();
  for (const [index, path] of cases.entries()) {
    await expect(page.locator(`.modified-tree [data-item-path="${path}"] svg use`).last()).toHaveAttribute('href', icons[index]);
  }
  await page.getByRole('button', { name: 'Close files' }).click();
  await page.locator('[data-unit-id]').first().getByRole('button', { name: /^Full file:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Full file diff' }).locator('h3 .file-type-icon use')).toHaveAttribute('href', icons[0]);
  const modalHeading = page.getByRole('dialog', { name: 'Full file diff' }).locator('h3');
  const modalIcon = (await modalHeading.locator('.file-type-icon').boundingBox())!;
  expect(modalIcon.x + modalIcon.width).toBeLessThan((await modalHeading.locator('span').boundingBox())!.x);
});

test('separate hunks retain original line numbers and full-file context is expandable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/reviews/ranges');
  const cards = page.locator('[data-unit-id]');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).locator('diffs-container [data-additions] [data-line="55"]')).toContainText('number55 = 5500');
  await expect(cards.nth(1).locator('diffs-container [data-additions] [data-line="5"]')).toHaveCount(0);
  await setLayout(page, 'unified');
  await expect(cards.nth(1).locator('diffs-container [data-line="55"][data-line-type="change-addition"]')).toContainText('number55 = 5500');
  await expect(cards.nth(1).locator('diffs-container [data-line="5"]')).toHaveCount(0);
  await setLayout(page, 'auto');
  await cards.nth(1).getByRole('button', { name: /^Full file:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Full file diff' });
  await expect(dialog.locator('diffs-container [data-additions] [data-line="55"]')).toContainText('number55 = 5500');
  await expect(dialog.locator('diffs-container [data-expand-index]').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('wrap toggle applies to split, unified, and full-file diffs and survives reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/reviews/ranges');
  const toggle = page.locator('.topbar').getByRole('button', { name: 'Wrap lines', exact: true });
  const cards = page.locator('[data-unit-id]');
  const longLine = cards.nth(1).locator('diffs-container [data-additions] [data-line="55"]');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(longLine).toHaveCSS('white-space', 'pre');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.nth(1).locator('diffs-container [data-diff-type="split"][data-overflow="wrap"]')).toBeVisible();
  await expect(longLine).toHaveCSS('white-space', 'pre-wrap');
  expect((await longLine.boundingBox())!.height).toBeGreaterThan(18);
  await expect(cards.nth(1).locator('diffs-container [data-line="5"]')).toHaveCount(0);
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(longLine).toHaveCSS('white-space', 'pre-wrap');
  await setLayout(page, 'unified');
  await expect(cards.nth(1).locator('diffs-container [data-diff-type="single"][data-overflow="wrap"]')).toBeVisible();
  await cards.nth(1).getByRole('button', { name: /^Full file:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Full file diff' });
  await expect(dialog.locator('diffs-container [data-overflow="wrap"]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Wrap lines', exact: true }).click();
  await expect(dialog.locator('diffs-container [data-overflow="scroll"]')).toBeVisible();
  await page.getByRole('button', { name: 'Close full file' }).click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(cards.nth(1).locator('diffs-container [data-overflow="scroll"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('on-demand navigation and bulk controls remain available', async ({ page }) => {
  await page.goto('/reviews/demo');
  await expect(page.getByRole('button', { name: 'Copy notes', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sections', exact: true }).click();
  const chapters = page.getByRole('menu', { name: 'Sections' });
  await chapters.getByRole('menuitem', { name: /^Tests/ }).click();
  await expect(chapters).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tests', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Toggle files' }).click();
  const inventory = page.getByRole('complementary', { name: 'Changed files' });
  const paths = await inventory.locator('[data-item-path]').evaluateAll(rows => rows.map(row => row.getAttribute('data-item-path')!).filter(path => !path.endsWith('/')));
  expect(paths.sort()).toEqual((await loadReview('demo')).snapshot.files.map(file => file.path).sort());
  await inventory.locator('[data-item-path="src/session.ts"]').click();
  await expect(inventory).toBeVisible();
  await expect(page.locator('[data-unit-id]').first()).toBeInViewport();
  await page.getByLabel('Review actions').click();
  await page.getByRole('menuitem', { name: 'Expand all', exact: true }).click();
  await expect(page.locator('[data-unit-id]').filter({ hasText: 'assets/state.bin' })).toContainText('Binary');
  await expect(page.getByRole('menu', { name: 'Review actions' })).not.toBeVisible();
});

test('menus anchor to their own triggers and restore keyboard focus', async ({ page }) => {
  await page.goto('/reviews/demo');
  for (const width of [1550, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['Sections', 'Review actions', 'Review details', 'Diff layout']) {
      const trigger = page.getByRole(name === 'Diff layout' ? 'combobox' : 'button', { name, exact: true });
      await trigger.focus();
      await page.keyboard.press('Enter');
      const popup = page.getByRole(name === 'Review details' ? 'dialog' : name === 'Diff layout' ? 'listbox' : 'menu', { name });
      await expect(popup).toBeVisible();
      const anchorBox = (await trigger.boundingBox())!;
      const popupBox = (await (name === 'Diff layout' ? page.locator('.layout-popup') : popup).boundingBox())!;
      expect(Math.abs(popupBox.y - (anchorBox.y + anchorBox.height) - 4)).toBeLessThan(2);
      expect(popupBox.x).toBeGreaterThanOrEqual(7);
      expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(width - 7);
      if (name === 'Sections' && width === 1550) expect(Math.abs(popupBox.x - anchorBox.x)).toBeLessThan(2);
      if (name === 'Review actions') {
        await expect(popup.getByRole('menuitem', { name: 'Expand all', exact: true })).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(popup.getByRole('menuitem', { name: 'Collapse reviewed', exact: true })).toBeFocused();
        await page.keyboard.press('ArrowUp');
        await expect(popup.getByRole('menuitem', { name: 'Expand all', exact: true })).toBeFocused();
      }
      await page.keyboard.press('Escape');
      await expect(popup).not.toBeVisible();
      await expect(trigger).toBeFocused();
    }
  }
});

test('layout dropdown supports keyboard selection and shares the popup styling', async ({ page }) => {
  await page.goto('/reviews/ranges');
  const trigger = page.getByRole('combobox', { name: 'Diff layout' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const popup = page.locator('.layout-popup');
  await expect(popup).toHaveCSS('border-radius', '14px');
  await expect(popup).toHaveCSS('border-top-width', '1px');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText('Split');
  await expect(popup).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(trigger).toContainText('Split');
});

test('file tree supports collapsed changes, repeat activation, search, and keyboard navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/reviews/demo');
  const toggle = page.getByRole('button', { name: 'Toggle files' });
  await toggle.click();
  const inventory = page.getByRole('complementary', { name: 'Changed files' });
  const binary = page.locator('[data-unit-id]').filter({ hasText: 'assets/state.bin' });
  await expect(binary.locator('.card-body')).toHaveCount(0);
  await inventory.locator('[data-item-path="assets/state.bin"]').click();
  await expect(binary).toBeInViewport();
  await expect(binary.locator('.card-body')).toContainText('Binary');
  const session = inventory.locator('[data-item-path="src/session.ts"]');
  await session.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-unit-id]').first()).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-unit-id]').first()).toBeInViewport();
  await page.keyboard.press('ArrowDown');
  await expect(inventory.locator('[data-item-path="src/SessionTabs.tsx"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-unit-id]').filter({ hasText: 'src/SessionTabs.tsx' })).toBeInViewport();
  await inventory.getByRole('textbox').fill('storage');
  await inventory.getByRole('textbox').press('Enter');
  await expect(page.locator('[data-unit-id]').filter({ hasText: 'src/storage.ts' })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(inventory).not.toBeVisible();
  await expect(toggle).toBeFocused();
  expect(errors).toEqual([]);
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('sidebars meet the header, viewport bottom, and screen edges with compact tree padding and file-type icons', async ({ page }) => {
  await page.goto('/reviews/demo');
  for (const width of [1550, 2100, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [toggle, name, edge] of [['Toggle files', 'Changed files', 'left'], ['Toggle notes', 'Review notes', 'right']] as const) {
      await page.getByRole('button', { name: toggle }).click();
      const panel = page.getByRole('complementary', { name });
      await expect(panel).toBeVisible();
      const panelLayer = await panel.evaluate(element => Number(getComputedStyle(element).zIndex));
      const headerLayer = await page.locator('.topbar').evaluate(element => Number(getComputedStyle(element).zIndex));
      expect(panelLayer).toBeGreaterThan(headerLayer);
      const box = (await panel.boundingBox())!;
      const header = (await page.locator('.topbar').boundingBox())!;
      expect(box.y).toBe(header.y + header.height);
      expect(box.y + box.height).toBe(1000);
      expect(edge === 'left' ? box.x : box.x + box.width).toBe(edge === 'left' ? 0 : width);
      await expect(panel).toHaveCSS('border-radius', '0px');
      await expect(panel).toHaveCSS(edge === 'left' ? 'border-right-width' : 'border-left-width', '1px');
      if (edge === 'left') {
        const searchBox = (await panel.getByRole('textbox').boundingBox())!;
        expect(searchBox.x - box.x).toBeLessThanOrEqual(10);
        expect(box.x + box.width - searchBox.x - searchBox.width).toBeLessThanOrEqual(10);
        const typeIcon = (path: string) => panel.locator(`[data-item-path="${path}"] svg use`).last().getAttribute('href');
        const icons = await Promise.all(['src/session.ts', 'src/SessionTabs.tsx', 'assets/tabs.svg', 'docs/restoration.md'].map(typeIcon));
        expect(new Set(icons).size).toBe(4);
        await page.screenshot({ path: `test-results/files-${width}.png` });
      }
      await page.getByRole('button', { name: toggle }).click();
    }
  }
});

test('marks progress, saves notes, exports only notes with context, and survives reload', async ({ page }) => {
  await page.goto('/reviews/demo');
  const card = page.locator('[data-unit-id]').filter({ hasText: 'src/storage.ts' }).first();
  await card.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Reviewed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.card-body')).toHaveCount(0);
  await card.getByRole('button', { name: 'Expand src/storage.ts', exact: true }).click();
  await expect(card.locator('diffs-container [data-line]').first()).toBeVisible();
  await expect(card.getByRole('button', { name: 'Reviewed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const checked = card.locator('.checkbox');
  await expect(checked).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect(await checked.evaluate(node => getComputedStyle(node).color)).not.toBe(await checked.evaluate(node => getComputedStyle(node).backgroundColor));
  await card.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Add note', exact: true }).fill('Why use the current timestamp for old sessions?');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.locator('.saved-note')).toHaveCount(1);
  await page.getByRole('button', { name: 'Copy notes', exact: true }).first().click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^src\/storage\.ts:\d/);
  expect(copied).toContain('Why use the current timestamp');
  expect(copied).toMatch(/\d+ \|/);
  expect(copied).not.toMatch(/My notes|Please answer/);
  await page.reload();
  await expect(card.getByRole('button', { name: 'Reviewed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Toggle notes' }).click();
  await expect(page.locator('.saved-note')).toContainText('Why use the current timestamp');
  const note = page.locator('.saved-note').first();
  await page.mouse.move(0, 0);
  await expect(note.locator('.note-actions')).toHaveCSS('opacity', '1');
  for (const name of ['Edit', 'Delete']) {
    const button = note.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button).toHaveCSS('padding-left', '7px');
    await expect(button).toHaveCSS('padding-right', '7px');
  }
  const location = (await note.locator('.note-location span').boundingBox())!;
  const icon = (await note.locator('.note-location .file-type-icon').boundingBox())!;
  expect(icon.x + icon.width).toBeLessThan(location.x);
  expect((await note.locator('p').boundingBox())!.x).toBe(icon.x);
  const noteBox = (await note.boundingBox())!;
  const deleteBox = (await note.getByRole('button', { name: 'Delete', exact: true }).boundingBox())!;
  expect(deleteBox.x + deleteBox.width).toBe(noteBox.x + noteBox.width - 8);
  await expect(note.locator('.note-location .file-type-icon')).toHaveAttribute('data-file-type', 'typescript');
  await page.screenshot({ path: 'test-results/notes.png', fullPage: false });
});

test('selects an exact line range using Pierre and adds a note', async ({ page }) => {
  await page.goto('/reviews/demo');
  const card = page.locator('[data-unit-id]').filter({ hasText: 'src/session.ts' }).first();
  const numbers = card.locator('diffs-container [data-additions] [data-column-number]');
  await numbers.first().click();
  await expect(card.getByRole('button', { name: /Note on selected lines/ })).toBeVisible();
  await card.getByRole('button', { name: /Note on selected lines/ }).click();
  await page.getByRole('textbox', { name: 'Add note', exact: true }).fill('Should this timestamp be optional?');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.locator('.saved-note').filter({ hasText: 'Should this timestamp' })).toBeVisible();
});

test('deletes notes immediately without a confirmation dialog', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.goto('/reviews/demo');
  await page.locator('[data-unit-id]').first().getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Add note', exact: true }).fill('Temporary note');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  const note = page.locator('.saved-note').filter({ hasText: 'Temporary note' });
  await note.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(note).toHaveCount(0);
  expect(dialogs).toEqual([]);
  expect((await loadReview('demo')).state.notes).toHaveLength(2);
});

test('compares images, switches layouts, and opens the full captured file', async ({ page }) => {
  await page.goto('/reviews/demo');
  const image = page.locator('[data-unit-id]').filter({ hasText: 'assets/tabs.svg' });
  await expect(image.getByRole('img', { name: 'Before: assets/tabs.svg' })).toBeVisible();
  await image.getByRole('button', { name: 'Slider', exact: true }).click();
  await image.getByLabel('Image comparison position').fill('25');
  await expect(image.locator('.overlay-before')).toHaveCSS('clip-path', 'inset(0px 75% 0px 0px)');
  await setLayout(page, 'unified');
  await expect(page.locator('diffs-container').first().locator('[data-diff-type="single"]')).toBeVisible();
  await page.locator('[data-unit-id]').first().getByRole('button', { name: /^Full file:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Full file diff' })).toBeVisible();
  await page.getByRole('button', { name: 'Close full file' }).click();
  await setLayout(page, 'auto');
});

test('mobile auto layout stays inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reviews/demo');
  await expect(page.locator('diffs-container').first().locator('[data-diff-type="single"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Toggle notes' }).click();
  await expect(page.getByRole('complementary', { name: 'Review notes' })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: false });
  await page.getByRole('button', { name: 'Close notes' }).click();
  await page.getByRole('button', { name: 'Toggle files' }).click();
  const inventory = page.getByRole('complementary', { name: 'Changed files' });
  await expect(inventory).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-files.png', fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await inventory.locator('[data-item-path="src/storage.ts"]').click();
  await expect(inventory).not.toBeVisible();
  await expect(page.locator('[data-unit-id]').filter({ hasText: 'src/storage.ts' })).toBeInViewport();
  await page.getByRole('button', { name: 'Toggle files' }).click();
  await page.getByRole('button', { name: 'Dismiss files' }).click({ position: { x: 375, y: 200 } });
  await expect(inventory).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle files' })).toBeFocused();
});

test('new snapshots retain unchanged progress and preserve outdated notes', async ({ page }) => {
  await page.goto('/reviews/demo');
  const contract = page.locator('[data-unit-id]').filter({ hasText: 'src/session.ts' }).first();
  await contract.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await page.getByRole('button', { name: 'Wrap lines', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Wrap lines', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await demo(2);
  await expect(page.getByRole('button', { name: 'Load new snapshot' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Load new snapshot' }).click();
  await expect(page.getByRole('button', { name: 'Wrap lines', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(contract.getByRole('button', { name: 'Reviewed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.flag.changed').first()).toBeVisible();
  await page.getByRole('button', { name: 'Toggle notes' }).click();
  await expect(page.locator('.saved-note')).toHaveCount(2);
  await expect(page.locator('.saved-note').filter({ hasText: 'Why use the current timestamp' })).toContainText('Outdated');
});
