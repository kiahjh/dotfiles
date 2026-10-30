import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rename, symlink, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { capture, loadReview, validatePlan, makeNote, reconcile, atomicJSON, reviewDirectory } from './core.ts';
import { exportNotes } from './model.ts';
import { createReviewServer } from './server.ts';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'user-review-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo'), home = join(root, 'artifacts');
  await mkdir(repo);
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: 'pipe' });
  const put = async (path: string, text: string | Buffer) => { await mkdir(join(repo, path, '..'), { recursive: true }); await writeFile(join(repo, path), text); };
  git('init', '-q');
  await put('app.ts', Array.from({ length: 45 }, (_, i) => `export const value${i} = ${i};`).join('\n') + '\n');
  await put('rename me.txt', 'unchanged content\n');
  await put('delete.txt', 'remove this file\n');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline');
  const modify = async () => {
    const text = await readFile(join(repo, 'app.ts'), 'utf8');
    await put('app.ts', text.replace('value5 = 5', 'value5 = 500').replace('value35 = 35', 'value35 = 3500'));
  };
  return { root, repo, home, git, put, modify, capture: () => capture({ repo, home, id: 'test' }) };
}

test('captures every hunk, untracked file, image, binary, deleted file, and pure rename', async t => {
  const f = await fixture(t); await f.modify();
  await f.put('new file.ts', 'export const fresh = true;\n');
  await f.put('empty.txt', '');
  await f.put('picture.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await f.put('opaque.bin', Buffer.from([0, 255, 3]));
  await unlink(join(f.repo, 'delete.txt'));
  await rename(join(f.repo, 'rename me.txt'), join(f.repo, 'renamed.txt'));
  f.git('add', '--', 'rename me.txt', 'renamed.txt');
  const data = await f.capture();
  assert.equal(data.snapshot.files.length, 7);
  assert.equal(data.snapshot.units.filter(u => u.fileId === data.snapshot.files.find(x => x.path === 'app.ts')!.id).length, 2);
  for (const file of data.snapshot.files) assert.ok(data.snapshot.units.some(u => u.fileId === file.id), file.path);
  assert.equal(data.snapshot.files.find(x => x.path === 'picture.svg')!.kind, 'image');
  assert.equal(data.snapshot.files.find(x => x.path === 'opaque.bin')!.kind, 'binary');
  assert.equal(data.snapshot.files.find(x => x.path === 'renamed.txt')!.previousPath, 'rename me.txt');
  assert.equal(data.snapshot.files.find(x => x.path === 'delete.txt')!.after, null);
  validatePlan(data.snapshot, data.plan);
});

test('snapshots retain exact original contents after working files change', async t => {
  const f = await fixture(t); await f.modify(); const data = await f.capture();
  const original = data.snapshot.files[0].after!.text;
  await f.put('app.ts', 'entirely different\n');
  const loaded = await loadReview('test', f.home);
  assert.equal(loaded.snapshot.files[0].after!.text, original);
  assert.equal(await readFile(join(reviewDirectory('test', f.home), 'assets', data.snapshot.files[0].after!.asset!), 'utf8'), original);
});

test('separates staged-only capture from unstaged and untracked content', async t => {
  const f = await fixture(t); await f.modify(); f.git('add', 'app.ts');
  const staged = await readFile(join(f.repo, 'app.ts'), 'utf8');
  await f.put('app.ts', staged + '// not staged\n'); await f.put('untracked.ts', 'hello');
  const data = await capture({ repo: f.repo, home: f.home, id: 'staged', staged: true });
  assert.equal(data.snapshot.files.length, 1);
  assert.equal(data.snapshot.files[0].after!.text, staged);
});

test('commit-to-commit capture ignores the dirty working tree', async t => {
  const f = await fixture(t); const base = f.git('rev-parse', 'HEAD').trim();
  await f.modify(); f.git('add', 'app.ts'); f.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'change');
  await f.put('app.ts', 'dirty');
  const data = await capture({ repo: f.repo, home: f.home, id: 'branch', base, head: 'HEAD' });
  assert.match(data.snapshot.files[0].after!.text!, /value5 = 500/);
});

test('captures mode changes and symlink targets without following symlinks', async t => {
  const f = await fixture(t); await chmod(join(f.repo, 'app.ts'), 0o755);
  await symlink('/etc/passwd', join(f.repo, 'link'));
  const data = await f.capture();
  assert.equal(data.snapshot.files.find(x => x.path === 'app.ts')!.after!.mode, '100755');
  const link = data.snapshot.files.find(x => x.path === 'link')!;
  assert.equal(link.after!.mode, '120000'); assert.equal(link.after!.text, '/etc/passwd');
});

test('empty changes produce a valid empty review', async t => {
  const f = await fixture(t); const data = await f.capture();
  assert.equal(data.snapshot.units.length, 0); validatePlan(data.snapshot, data.plan);
});

test('concurrent captures serialize and publish complete independent snapshots', async t => {
  const f = await fixture(t); await f.modify();
  const [a, b] = await Promise.all([f.capture(), f.capture()]);
  assert.notEqual(a.snapshot.id, b.snapshot.id);
  const current = await loadReview('test', f.home);
  assert.equal(current.snapshot.id, current.state.snapshotId);
  assert.ok(current.state.previousSnapshotId);
  validatePlan(current.snapshot, current.plan);
});

test('coverage validator rejects missing, duplicate, unknown, stale, and malformed entries', async t => {
  const f = await fixture(t); await f.modify(); const { snapshot, plan } = await f.capture();
  const missing = structuredClone(plan); missing.chapters[0].items.pop();
  assert.throws(() => validatePlan(snapshot, missing), /Uncovered/);
  const duplicate = structuredClone(plan); duplicate.chapters[0].items.push(duplicate.chapters[0].items[0]);
  assert.throws(() => validatePlan(snapshot, duplicate), /Duplicate/);
  const unknown = structuredClone(plan); unknown.chapters[0].items[0].unitId = 'fiction';
  assert.throws(() => validatePlan(snapshot, unknown), /Unknown/);
  assert.throws(() => validatePlan(snapshot, { ...plan, snapshotId: 'old' }), /snapshot/);
  const malformed = structuredClone(plan); malformed.chapters[0].title = '';
  assert.throws(() => validatePlan(snapshot, malformed), /chapter/);
});

test('preserves unchanged progress through line shifts and flags only modified chunks', async t => {
  const f = await fixture(t); await f.modify(); const first = await f.capture();
  for (const unit of first.snapshot.units) first.state.reviewed[unit.id] = true;
  await atomicJSON(join(reviewDirectory('test', f.home), 'states', `${first.snapshot.id}.json`), first.state);
  const source = await readFile(join(f.repo, 'app.ts'), 'utf8');
  await f.put('app.ts', '// new introduction\n' + source.replace('value5 = 500', 'value5 = 9999'));
  const second = await f.capture();
  assert.equal(second.snapshot.units.filter(u => second.state.reviewed[u.id]).length, 1);
  assert.equal(Object.values(second.state.flags).filter(v => v === 'changed').length, 1);
});

test('line wrapping defaults off for older state files and carries across snapshots', async t => {
  const f = await fixture(t); await f.modify(); const first = await f.capture();
  assert.equal(first.state.wrapLines, false);
  delete first.state.wrapLines;
  const statePath = join(reviewDirectory('test', f.home), 'states', `${first.snapshot.id}.json`);
  await atomicJSON(statePath, first.state);
  const legacy = await loadReview('test', f.home);
  assert.equal(reconcile(legacy, first.snapshot).wrapLines, false);
  legacy.state.wrapLines = true;
  await atomicJSON(statePath, legacy.state);
  await f.put('app.ts', '// next revision\n' + first.snapshot.files[0].after!.text);
  const second = await f.capture();
  assert.equal(second.state.wrapLines, true);
  assert.equal((await loadReview('test', f.home)).state.wrapLines, true);
});

test('notes relocate through line shifts but retain original code when the anchor changes', async t => {
  const f = await fixture(t); await f.modify(); const first = await f.capture();
  first.state.notes = [makeNote(first.snapshot, { unitId: first.snapshot.units[0].id, side: 'after', start: 6, end: 6, text: 'Why five hundred?' })];
  await f.put('app.ts', '// shifted\n' + first.snapshot.files[0].after!.text);
  const second = await f.capture(); const carried = reconcile(first, second.snapshot);
  assert.equal(carried.notes[0].start, 7); assert.equal(carried.notes[0].outdated, false);
  await f.put('app.ts', second.snapshot.files[0].after!.text!.replace('value5 = 500', 'value5 = 501'));
  const third = await f.capture(); const stale = reconcile({ ...second, state: carried }, third.snapshot);
  assert.equal(stale.notes[0].outdated, true); assert.match(stale.notes[0].context, /value5 = 500/);
});

test('ambiguous anchors are never silently relocated', async t => {
  const f = await fixture(t); await f.modify(); const first = await f.capture();
  first.state.notes = [makeNote(first.snapshot, { unitId: first.snapshot.units[0].id, side: 'after', start: 6, end: 6, text: 'Why?' })];
  await f.put('app.ts', first.snapshot.files[0].after!.text! + 'export const value5 = 500;\n');
  const second = await f.capture();
  assert.equal(reconcile(first, second.snapshot).notes[0].outdated, true);
});

test('deleted targets retain notes instead of silently dropping them', async t => {
  const f = await fixture(t); await f.modify(); const first = await f.capture();
  first.state.notes = [makeNote(first.snapshot, { unitId: first.snapshot.units[0].id, side: 'after', start: 6, end: 6, text: 'Why?' })];
  await unlink(join(f.repo, 'app.ts')); const second = await f.capture();
  const state = reconcile(first, second.snapshot);
  assert.equal(state.notes.length, 1); assert.equal(state.notes[0].outdated, true);
});

test('exports only notes, locations, original numbered context, and safe code fences', async t => {
  const f = await fixture(t); await f.modify(); const data = await f.capture();
  const note = makeNote(data.snapshot, { unitId: data.snapshot.units[0].id, side: 'before', start: 6, end: 7, text: '  Why this?\nPlease explain.  ' });
  const output = exportNotes([note], data.plan);
  assert.ok(output.startsWith('app.ts:6-7 [before] ← Why this?'));
  assert.match(output, /3 \| export const value2/); assert.match(output, /6 \| export const value5 = 5/);
  assert.doesNotMatch(output, /My notes|Please answer|snapshot/);
  assert.ok(exportNotes([{ ...note, context: '```danger\ntext' }]).includes('````'));
  assert.equal(exportNotes([]), '');
});

test('rejects invalid note selections and paths', async t => {
  const f = await fixture(t); await f.modify(); const data = await f.capture();
  const input = { unitId: data.snapshot.units[0].id, side: 'after' as const, start: 1, end: 999, text: 'Why?' };
  assert.throws(() => makeNote(data.snapshot, input), /range/);
  assert.throws(() => reviewDirectory('../escape', f.home), /Invalid/);
});

test('server persists mutations, rejects stale saves, cross-origin writes, and traversal', async t => {
  const f = await fixture(t); await f.modify(); const data = await f.capture();
  const server = createReviewServer(f.home);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const port = (server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}/api/reviews/test/actions`;
  const post = (body: unknown, origin = `http://127.0.0.1:${port}`) => fetch(url, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-User-Review': '1', Origin: origin,
  }, body: JSON.stringify(body) });
  const action = { snapshotId: data.snapshot.id, type: 'review', ids: [data.snapshot.units[0].id], reviewed: true };
  assert.equal((await post(action)).status, 200);
  assert.equal((await loadReview('test', f.home)).state.reviewed[data.snapshot.units[0].id], true);
  const wrapAction = { snapshotId: data.snapshot.id, type: 'wrap', wrapLines: true };
  assert.equal((await post(wrapAction)).status, 200);
  assert.equal((await loadReview('test', f.home)).state.wrapLines, true);
  assert.equal((await post({ ...wrapAction, wrapLines: 'true' })).status, 400);
  assert.equal((await loadReview('test', f.home)).state.wrapLines, true);
  assert.equal((await post({ ...wrapAction, wrapLines: false })).status, 200);
  assert.equal((await loadReview('test', f.home)).state.wrapLines, false);
  assert.equal((await post({ ...action, snapshotId: 'stale' })).status, 409);
  assert.equal((await post(action, 'https://evil.example')).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) })).status, 403);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/reviews/test/assets/%2e%2e%2fstate.json`)).status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/reviews/test/assets/${'a'.repeat(64)}.png`)).status, 404);
  const page = await fetch(`http://127.0.0.1:${port}/`); assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
  const asset = await fetch(`http://127.0.0.1:${port}/api/reviews/test/assets/${data.snapshot.files[0].after!.asset}`);
  assert.equal(asset.headers.get('content-disposition'), 'attachment');
  assert.equal(asset.headers.get('content-type'), 'application/octet-stream');
  assert.match(asset.headers.get('content-security-policy')!, /sandbox/);
  await Promise.all([
    post({ ...action, ids: [data.snapshot.units[1].id] }),
    post({ snapshotId: data.snapshot.id, type: 'note-add', unitId: data.snapshot.units[0].id, side: 'after', start: 6, end: 6, text: 'Saved alongside progress' }),
  ]);
  const final = await loadReview('test', f.home);
  assert.equal(final.state.notes.length, 1);
  assert.equal(final.state.reviewed[data.snapshot.units[1].id], true);
});
