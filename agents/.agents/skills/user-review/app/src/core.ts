import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, lstat, readlink, rmdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { homedir } from 'node:os';
import { parseDiffFromFile } from '@pierre/diffs';
import { lines, type Snapshot, type Unit, type ReviewFile, type Version, type Plan, type ReviewState, type Note, type ReviewData } from './model.ts';

export const HOME = process.env.USER_REVIEW_HOME ?? join(homedir(), 'Library/Application Support/User Review');
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const validId = (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);
export function reviewDirectory(id: string, home = HOME) {
  if (!validId(id)) throw new Error('Invalid review ID');
  return join(home, 'reviews', id);
}
export async function json<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')); }
export async function atomicJSON(path: string, data: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(temp, path);
}
// Serialize CLI captures, plan updates, and browser writes across processes.
// Never silently remove an existing lock: an interrupted capture should not
// give another writer permission to race a process that may still be alive.
export async function withReviewLock<T>(dir: string, action: () => Promise<T>): Promise<T> {
  const lock = join(dir, '.write-lock');
  const deadline = Date.now() + 30000;
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error(`Review is busy. If no user-review process is writing, remove the stale lock: ${lock}`);
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  }
  try { return await action(); } finally { await rmdir(lock); }
}
function git(repo: string, ...args: string[]): Buffer {
  return execFileSync('git', ['--no-optional-locks', '-C', repo, ...args], { maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
function ref(repo: string, value: string) {
  return git(repo, 'rev-parse', '--verify', '--end-of-options', `${value}^{commit}`).toString().trim();
}

export interface CaptureOptions {
  repo?: string; base?: string; head?: string; staged?: boolean; id?: string; title?: string; home?: string;
}
export async function capture(options: CaptureOptions = {}): Promise<ReviewData> {
  const repo = git(resolve(options.repo ?? process.cwd()), 'rev-parse', '--show-toplevel').toString().trim();
  if (options.staged && options.head) throw new Error('--staged and --head cannot be combined');
  const base = ref(repo, options.base ?? 'HEAD');
  const head = options.head ? ref(repo, options.head) : options.staged ? 'index' : 'worktree';
  const id = options.id ?? `review-${digest(`${repo}:${base}:${head}`).slice(0, 12)}`;
  const dir = reviewDirectory(id, options.home);
  await mkdir(join(dir, 'snapshots'), { recursive: true, mode: 0o700 });
  await mkdir(join(dir, 'plans'), { recursive: true, mode: 0o700 });
  await mkdir(join(dir, 'states'), { recursive: true, mode: 0o700 });
  await mkdir(join(dir, 'assets'), { recursive: true, mode: 0o700 });
  return withReviewLock(dir, () => captureSnapshot(options, repo, base, head, id, dir));
}

async function captureSnapshot(options: CaptureOptions, repo: string, base: string, head: string, id: string, dir: string): Promise<ReviewData> {
  let previous: ReviewData | undefined;
  try { previous = await loadReview(id, options.home); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (previous && previous.snapshot.repository !== repo) throw new Error('Review ID already belongs to a different repository');
  const args = ['diff', '--no-ext-diff', '--no-textconv', '--name-status', '-z', '--find-renames'];
  if (options.staged) args.push('--cached');
  args.push(base);
  if (options.head) args.push(head);
  args.push('--');
  const inventory = git(repo, ...args).toString();
  const untracked = head === 'worktree' ? git(repo, 'ls-files', '--others', '--exclude-standard', '-z').toString() : '';
  const fields = inventory.split('\0').filter(Boolean);
  const changes: { status: string; path: string; previousPath?: string }[] = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++];
    const first = fields[i++];
    if (!first) throw new Error('Malformed git change inventory');
    if (/^[RC]/.test(status)) changes.push({ status, previousPath: first, path: fields[i++] });
    else changes.push({ status, path: first });
  }
  if (head === 'worktree') {
    for (const path of untracked.split('\0').filter(Boolean)) {
      if (!changes.some(c => c.path === path)) changes.push({ status: 'A', path });
    }
  }
  if (changes.some(c => c.status.startsWith('U'))) throw new Error('Resolve merge conflicts before capturing a review');
  const files: ReviewFile[] = [];
  const units: Unit[] = [];

  async function version(path: string, revision: string): Promise<Version> {
    let bytes: Buffer;
    let mode: string;
    if (revision === 'worktree') {
      const absolute = join(repo, path);
      const stat = await lstat(absolute);
      if (stat.isDirectory()) {
        // Submodule contents are not recursively pulled into the parent review.
        mode = '160000';
        bytes = Buffer.from(git(absolute, 'rev-parse', 'HEAD').toString());
      } else {
        mode = stat.isSymbolicLink() ? '120000' : stat.mode & 0o111 ? '100755' : '100644';
        bytes = stat.isSymbolicLink() ? Buffer.from(await readlink(absolute)) : await readFile(absolute);
      }
    } else {
      const tree = revision === 'index'
        ? git(repo, 'ls-files', '--stage', '-z', '--', path).toString()
        : git(repo, 'ls-tree', '-z', revision, '--', path).toString();
      mode = tree.split(' ')[0];
      if (!mode) throw new Error(`Missing captured file: ${path}`);
      bytes = mode === '160000'
        ? Buffer.from(tree.split(/[ \t]/)[revision === 'index' ? 1 : 2].trim() + '\n')
        : git(repo, 'show', `${revision === 'index' ? '' : revision}:${path}`);
    }
    const hash = digest(bytes);
    const suffix = extname(path).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
    const asset = `${hash}${suffix}`;
    await writeFile(join(dir, 'assets', asset), bytes, { mode: 0o600 });
    const utf8 = bytes.toString('utf8');
    const text = !bytes.includes(0) && Buffer.from(utf8).equals(bytes) ? utf8 : undefined;
    return { hash, size: bytes.length, mode, asset, text };
  }

  for (const change of changes) {
    const before = change.status.startsWith('A') ? null : await version(change.previousPath ?? change.path, base);
    const after = change.status.startsWith('D') ? null : await version(change.path, head);
    const image = [before, after].every(v => v == null || v.mode !== '120000') && /\.(png|jpe?g|webp|gif|avif|svg|ico)$/i.test(change.path);
    const kind = image ? 'image' : [before, after].every(v => v == null || v.text !== undefined) ? 'text' : 'binary';
    const file: ReviewFile = { ...change, id: `f-${digest(change.path).slice(0, 16)}`, before, after, kind };
    // A nonempty new/deleted text file already has a complete review unit;
    // don't inflate progress with a second "file added" checkbox.
    const metadataChanged = !!before && !!after && (before.mode !== after.mode || !!change.previousPath);
    if (kind === 'text') {
      file.diff = parseDiffFromFile(
        before ? { name: change.previousPath ?? change.path, contents: before.text! } : null,
        after ? { name: change.path, contents: after.text! } : null,
        { context: 3 }, true,
      );
      const occurrences = new Map<string, number>();
      file.diff.hunks.forEach((hunk, index) => {
        const oldText = file.diff!.deletionLines.slice(hunk.deletionLineIndex, hunk.deletionLineIndex + hunk.deletionCount).join('');
        const newText = file.diff!.additionLines.slice(hunk.additionLineIndex, hunk.additionLineIndex + hunk.additionCount).join('');
        const signature = digest(JSON.stringify([kind, oldText, newText]));
        const count = occurrences.get(signature) ?? 0;
        occurrences.set(signature, count + 1);
        units.push({ id: `u-${digest(`${file.id}:${signature}:${count}`).slice(0, 20)}`, fileId: file.id, signature, kind,
          hunkIndex: index, oldStart: hunk.deletionStart, oldCount: hunk.deletionCount,
          newStart: hunk.additionStart, newCount: hunk.additionCount, additions: hunk.additionLines, deletions: hunk.deletionLines });
      });
    }
    if (kind !== 'text' || metadataChanged || !file.diff?.hunks.length) {
      const unitKind = kind === 'text' ? 'metadata' : kind;
      const signature = digest(JSON.stringify([unitKind, before?.hash, after?.hash, before?.mode, after?.mode, change.previousPath]));
      units.push({ id: `u-${digest(`${file.id}:${signature}`).slice(0, 20)}`, fileId: file.id, signature,
        kind: unitKind, oldStart: 0, oldCount: 0, newStart: 0, newCount: 0, additions: 0, deletions: 0 });
    }
    files.push(file);
  }
  if (head === 'worktree' || head === 'index') {
    if (git(repo, ...args).toString() !== inventory || (head === 'worktree' && git(repo, 'ls-files', '--others', '--exclude-standard', '-z').toString() !== untracked)) throw new Error('Change inventory moved during capture. Retry when the workspace is stable.');
    for (const file of files) if (file.after) {
      const current = await version(file.path, head);
      if (current.hash !== file.after.hash || current.mode !== file.after.mode) throw new Error(`File changed during capture: ${file.path}. Retry when the workspace is stable.`);
    }
  }
  const snapshot: Snapshot = {
    schema: 1, id: `s-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`, reviewId: id,
    title: options.title ?? previous?.snapshot.title ?? 'Changes for review', createdAt: new Date().toISOString(), repository: repo,
    scope: `${options.base ?? 'HEAD'} → ${options.head ?? (options.staged ? 'staged changes' : 'working tree + untracked files')}`,
    base, head, files, units,
  };
  const plan = defaultPlan(snapshot);
  const state = reconcile(previous, snapshot);
  await atomicJSON(join(dir, 'snapshots', `${snapshot.id}.json`), snapshot);
  await atomicJSON(join(dir, 'plans', `${snapshot.id}.json`), plan);
  await atomicJSON(join(dir, 'states', `${snapshot.id}.json`), state);
  // Publish only after all snapshot files are ready.
  await atomicJSON(join(dir, 'current.json'), { snapshotId: snapshot.id });
  return { snapshot, plan, state };
}

export function defaultPlan(snapshot: Snapshot): Plan {
  return { schema: 1, snapshotId: snapshot.id, curated: false,
    chapters: snapshot.units.length ? [{ id: 'changes', title: 'Changes',
      items: snapshot.units.map(unit => {
        const file = snapshot.files.find(file => file.id === unit.fileId)!;
        return { unitId: unit.id, expanded: !/lock|generated|min\./i.test(file.path) };
      }) }] : [] };
}

export function validatePlan(snapshot: Snapshot, input: unknown): asserts input is Plan {
  const plan = input as Plan;
  if (!plan || plan.schema !== 1 || plan.snapshotId !== snapshot.id || !Array.isArray(plan.chapters)) throw new Error('Plan schema or snapshot ID does not match');
  if (typeof plan.curated !== 'boolean' || (plan.summary !== undefined && typeof plan.summary !== 'string')) throw new Error('Invalid plan metadata');
  const expected = new Set(snapshot.units.map(u => u.id));
  const seen = new Set<string>();
  const chapters = new Set<string>();
  for (const chapter of plan.chapters) {
    if (!validId(chapter.id) || chapters.has(chapter.id) || typeof chapter.title !== 'string' || !chapter.title.trim() || !Array.isArray(chapter.items)) throw new Error('Invalid or duplicate chapter');
    chapters.add(chapter.id);
    if (chapter.description !== undefined && typeof chapter.description !== 'string') throw new Error('Invalid chapter description');
    for (const item of chapter.items) {
      if (!expected.has(item.unitId)) throw new Error(`Unknown change: ${item.unitId}`);
      if (seen.has(item.unitId)) throw new Error(`Duplicate change: ${item.unitId}`);
      seen.add(item.unitId);
      if (item.expanded !== undefined && typeof item.expanded !== 'boolean') throw new Error('Invalid expansion state');
      if (item.emphasis !== undefined && !['normal', 'attention', 'mechanical'].includes(item.emphasis)) throw new Error('Invalid emphasis');
      for (const key of ['title', 'explanation'] as const) if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error(`Invalid ${key}`);
    }
  }
  const missing = [...expected].filter(id => !seen.has(id));
  if (missing.length) throw new Error(`Uncovered changes (${missing.length}): ${missing.join(', ')}`);
}

export function reconcile(previous: ReviewData | undefined, snapshot: Snapshot): ReviewState {
  const state: ReviewState = { schema: 1, snapshotId: snapshot.id, reviewed: {}, flags: {}, notes: [],
    layout: previous?.state.layout ?? 'auto', wrapLines: previous?.state.wrapLines ?? false,
    previousSnapshotId: previous?.snapshot.id };
  if (!previous) return state;
  const mapping = new Map<string, string>();
  for (const unit of snapshot.units) {
    const candidates = previous.snapshot.units.filter(old => old.signature === unit.signature);
    const local = candidates.filter(old => old.fileId === unit.fileId);
    const matches = local.length ? local : candidates;
    const newCount = snapshot.units.filter(u => u.signature === unit.signature && (local.length ? u.fileId === unit.fileId : true)).length;
    const match = matches.length === 1 && newCount === 1 ? matches[0] : undefined;
    if (match) {
      state.reviewed[unit.id] = !!previous.state.reviewed[match.id];
      mapping.set(match.id, unit.id);
      if (!state.reviewed[unit.id] && previous.state.flags[match.id]) state.flags[unit.id] = previous.state.flags[match.id];
    } else state.flags[unit.id] = previous.snapshot.units.some(old => old.fileId === unit.fileId) ? 'changed' : 'new';
  }
  state.notes = previous.state.notes.map(note => {
    const unitId = note.unitId && mapping.get(note.unitId);
    const originalFile = previous.snapshot.files.find(f => f.path === note.path || f.previousPath === note.path);
    const file = snapshot.files.find(f => f.path === note.path || f.previousPath === note.path)
      ?? (unitId ? snapshot.files.find(f => f.id === snapshot.units.find(u => u.id === unitId)?.fileId) : undefined);
    const source = file?.[note.side]?.text;
    if (note.start === 0) {
      const same = file && originalFile?.[note.side]?.hash === file[note.side]?.hash;
      return { ...note, unitId, outdated: !same || note.outdated };
    }
    if (!source || !note.selectedText) return { ...note, unitId, outdated: true };
    // Match whole lines, never a coincidental substring inside another line.
    const sourceLines = lines(source);
    const selected = lines(note.selectedText);
    const locations = sourceLines.flatMap((_, i) => sourceLines.slice(i, i + selected.length).join('\n') === selected.join('\n') ? [i] : []);
    if (locations.length !== 1 || note.outdated) return { ...note, unitId, outdated: true };
    const start = locations[0] + 1;
    const end = start + selected.length - 1;
    const contextStart = Math.max(1, start - 3);
    const anchoredUnit = snapshot.units.find(u => u.fileId === file!.id && (note.side === 'after'
      ? start >= u.newStart && start < u.newStart + u.newCount : start >= u.oldStart && start < u.oldStart + u.oldCount));
    return { ...note, path: note.side === 'before' ? file!.previousPath ?? file!.path : file!.path,
      start, end, contextStart, context: sourceLines.slice(contextStart - 1, end + 3).join('\n'), unitId: unitId || anchoredUnit?.id, outdated: false, snapshotId: snapshot.id };
  });
  return state;
}

export async function loadReview(id: string, home = HOME): Promise<ReviewData> {
  const dir = reviewDirectory(id, home);
  const { snapshotId } = await json<{ snapshotId: string }>(join(dir, 'current.json'));
  if (!validId(snapshotId)) throw new Error('Invalid snapshot ID');
  const [snapshot, plan, state] = await Promise.all([
    json<Snapshot>(join(dir, 'snapshots', `${snapshotId}.json`)), json<Plan>(join(dir, 'plans', `${snapshotId}.json`)), json<ReviewState>(join(dir, 'states', `${snapshotId}.json`)),
  ]);
  validatePlan(snapshot, plan);
  if (state.snapshotId !== snapshot.id) throw new Error('Review update in progress; retry');
  return { snapshot, plan, state };
}

export async function applyPlan(id: string, input: unknown, home = HOME) {
  await withReviewLock(reviewDirectory(id, home), async () => {
    const data = await loadReview(id, home);
    validatePlan(data.snapshot, input);
    await atomicJSON(join(reviewDirectory(id, home), 'plans', `${data.snapshot.id}.json`), input);
  });
}

export function makeNote(snapshot: Snapshot, input: { unitId: string; side: 'before' | 'after'; start: number; end: number; text: string }): Note {
  const unit = snapshot.units.find(u => u.id === input.unitId);
  if (!unit || !['before', 'after'].includes(input.side) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 20000) throw new Error('Invalid note');
  const file = snapshot.files.find(f => f.id === unit.fileId)!;
  const source = lines(file[input.side]?.text ?? '');
  const start = input.start, end = input.end;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length || (start === 0 && end !== 0)) throw new Error('Invalid note range');
  const contextStart = start > 0 ? Math.max(1, start - 3) : 0;
  return { id: randomUUID(), unitId: unit.id, path: input.side === 'before' ? file.previousPath ?? file.path : file.path,
    side: input.side, start, end, text: input.text.trim(), selectedText: start ? source.slice(start - 1, end).join('\n') : '',
    context: start ? source.slice(contextStart - 1, end + 3).join('\n') : '', contextStart,
    snapshotId: snapshot.id, outdated: false, createdAt: new Date().toISOString() };
}
