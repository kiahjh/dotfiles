// Optional smoke test against a running lab. Requires Playwright only for testing.
// State/save endpoints are mocked: this never writes to the repository.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.LAB_URL || 'http://127.0.0.1:4173';
const original = await (await fetch(`${url}/api/state`)).json();
let serverState = structuredClone(original), saves = 0;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('dialog', (dialog) => dialog.accept());
await page.route('**/api/state', (route) => route.fulfill({ json: serverState }));
await page.route('**/api/save', async (route) => {
  const payload = route.request().postDataJSON();
  assert.equal(payload.revision, serverState.revision);
  assert.ok(route.request().headers().authorization.startsWith('Bearer '));
  saves++;
  serverState = { ...serverState, palette: payload.palette, revision: `test-save-${saves}` };
  await route.fulfill({ json: serverState });
});
const ready = () => page.locator('.nv-line').first().waitFor();
const variable = (name) => page.locator('#preview').evaluate((el, key) => el.style.getPropertyValue(`--${key}`), name);
const edit = async (key, value) => {
  await page.locator(`#hex-${key}`).fill(value);
  await page.locator(`#hex-${key}`).press('Tab');
};
const waitFor = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for lab state');
};
const screenshot = async (name) => {
  if (process.env.LAB_SCREENSHOTS) {
    await mkdir(process.env.LAB_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: join(process.env.LAB_SCREENSHOTS, name) });
  }
};
try {
  await page.goto(url);
  await ready();
  assert.equal(await page.locator('#theme-name').textContent(), original.palette.name);
  // Every color except name and mode is editable.
  assert.equal(await page.locator('[data-color]').count(), Object.keys(original.palette).length - 2);
  await screenshot('workspace.png');

  // Every preview renders, and the keyboard switches between them.
  for (const [key, view] of [['2', 'xcode'], ['3', 'terminal'], ['4', 'contrast'], ['1', 'workspace']]) {
    await page.keyboard.press(key);
    assert.equal(await page.locator(`#view-${view}`).isVisible(), true, view);
    await screenshot(`${view}.png`);
  }
  assert.equal(await page.locator('#view-terminal .ansi-swatch').count(), 16);
  assert.ok(await page.locator('#view-xcode .xc-line').count() > 20);
  assert.ok(await page.locator('#contrast-matrix td').count() > 50);

  // Pointing at a preview names its colors; clicking selects that color.
  const keyword = page.locator('#view-workspace .nv-editor [data-fg="keyword"]').first();
  await keyword.hover();
  assert.match(await page.locator('#inspect').textContent(), /text keyword/);
  await keyword.click();
  assert.equal(await page.locator('.token-row.active').getAttribute('data-key'), 'keyword');

  await edit('green', '#aabb99');
  assert.equal(await page.locator('#edit-count').textContent(), '1 edit');
  assert.equal(await variable('green'), '#aabb99');
  await waitFor(async () => (await (await fetch(`${url}/api/preview`)).json()).palette.green === '#aabb99');
  await page.locator('#compare').click();
  assert.equal(await variable('green'), original.palette.green);
  await waitFor(async () => (await (await fetch(`${url}/api/preview`)).json()).palette.green === original.palette.green);
  await page.locator('#undo').click();
  assert.equal(await page.locator('#hex-green').inputValue(), original.palette.green);
  await page.locator('#redo').click();
  await page.reload(); await ready();
  assert.equal(await page.locator('#hex-green').inputValue(), '#aabb99');
  // Filtering matches names and where colors are used.
  await page.locator('#token-search').fill('comments');
  assert.deepEqual(await page.locator('.token-row:visible').evaluateAll((rows) => rows.map((row) => row.dataset.key)), ['muted']);
  await page.locator('#token-search').fill('');

  await page.locator('#save').click();
  assert.equal(await page.locator('#save-dialog').evaluate((el) => el.open), true);
  await page.locator('#save-dialog button[value=cancel]').click();
  assert.equal(saves, 0);
  await page.locator('#save').click();
  await page.locator('#save-dialog button[value=save]').click();
  await waitFor(async () => (await page.locator('#save-state').textContent()) === 'Saved');
  assert.equal(saves, 1);

  // A draft must not silently acquire the revision of a newer disk palette.
  await edit('green', '#bbccaa');
  serverState = { ...serverState, revision: 'external-change', palette: { ...serverState.palette, blue: '#aaccdd' } };
  await waitFor(async () => (await page.locator('#save-state').textContent()) === 'Disk changed');
  await page.reload(); await ready();
  assert.equal(await page.locator('#hex-green').inputValue(), '#bbccaa');
  assert.equal(await page.locator('#save').isDisabled(), true);
  assert.match(await page.locator('#notice').textContent(), /older disk palette/);
  await page.locator('.menu summary').click();
  await page.locator('#reload').click();
  await waitFor(async () => (await page.locator('#hex-blue').inputValue()) === '#aaccdd');
  assert.equal(await page.locator('#edit-count').textContent(), '0 edits');

  // Import and export stay in the browser.
  await page.locator('#import-file').setInputFiles({ name: 'candidate.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...serverState.palette, purple: '#ccbbee' })) });
  await waitFor(async () => (await page.locator('#hex-purple').inputValue()) === '#ccbbee');
  const downloading = page.waitForEvent('download');
  await page.locator('.menu summary').click();
  await page.locator('#export').click();
  assert.equal((await downloading).suggestedFilename(), `${original.palette.name}.json`);
  await page.setViewportSize({ width: 1024, height: 700 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1024);
  assert.deepEqual(errors, []);
  console.log('Browser lab passed: previews, inspecting, editing, compare, undo/redo, recovery, bridge, save confirmation, conflicts, import/export.');
} finally {
  // Restore the memory-only terminal bridge to the actual on-disk palette.
  await page.evaluate(async (palette) => {
    localStorage.removeItem(`theme-lab-draft-${palette.name}`);
    await fetch('/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${document.querySelector('meta[name=lab-token]').content}` }, body: JSON.stringify({ palette }) });
  }, original.palette).catch(() => {});
  await browser.close();
}
