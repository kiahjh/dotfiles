#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, mkdir, open as openFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { capture, applyPlan, loadReview, HOME } from '../src/core.ts';
import { serve } from '../src/server.ts';
import { demo } from '../src/demo.ts';
import { exportNotes } from '../src/model.ts';

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  repo: { type: 'string' }, base: { type: 'string' }, head: { type: 'string' }, id: { type: 'string' }, title: { type: 'string' },
  staged: { type: 'boolean' }, file: { type: 'string' }, port: { type: 'string', default: '4731' },
  revision: { type: 'string', default: '1' }, 'no-open': { type: 'boolean' }, pr: { type: 'string' }, help: { type: 'boolean' },
} });
const [command, reviewId] = positionals;
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const origin = `http://127.0.0.1:${port}`;

async function launch(id) {
  await loadReview(id);
  let running = false;
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(800) });
    const health = await response.json();
    if (health.app !== 'user-review' || health.home !== HOME) throw new Error(`Port ${port} belongs to a different service`);
    running = true;
  } catch (error) {
    if (error.message?.includes('different service')) throw error;
  }
  if (!running) {
    await mkdir(HOME, { recursive: true, mode: 0o700 });
    const log = await openFile(join(HOME, 'server.log'), 'a', 0o600);
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', '--port', `${port}`], {
      detached: true, stdio: ['ignore', log.fd, log.fd], env: process.env,
    });
    child.unref();
    await log.close();
    // A bounded readiness check, not a blind startup delay.
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      try { const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) }); if (response.ok) { running = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!running) throw new Error(`Server did not start; see ${join(HOME, 'server.log')}`);
  }
  const url = `${origin}/reviews/${encodeURIComponent(id)}`;
  if (!values['no-open']) execFileSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
  console.log(url);
}

try {
  if (values.help || !command) {
    console.log(`User Review — local, complete, agent-curated change reviews

  user-review capture [--repo PATH] [--base REF] [--head REF | --staged]
                      [--pr NUMBER_OR_URL] [--id REVIEW_ID] [--title TITLE]
  user-review inspect REVIEW_ID           Print snapshot + editable plan
  user-review plan REVIEW_ID --file JSON  Validate and install a reading plan
  user-review open REVIEW_ID              Open the local viewer
  user-review notes REVIEW_ID             Print only notes + numbered context
  user-review serve [--port 4731]         Run the local server in foreground
  user-review demo [--revision 1|2]        Generate and open a sample review

Use the same --id to capture another revision and preserve review progress.
Artifacts: ${HOME}
Node >=22.18 required. Run bun run build once before opening the viewer.`);
  } else if (command === 'serve') {
    await serve(port);
    console.log(`User Review listening at ${origin}`);
  } else if (command === 'capture') {
    let options = { repo: values.repo, base: values.base, head: values.head, staged: values.staged, id: values.id, title: values.title };
    if (values.pr) {
      const repo = resolve(values.repo ?? process.cwd());
      const pr = JSON.parse(execFileSync('gh', ['pr', 'view', values.pr, '--json', 'number,title,baseRefOid,headRefOid,url'], { cwd: repo, encoding: 'utf8' }));
      // Only fetch objects; never switch branches or modify working files.
      execFileSync('git', ['-C', repo, 'fetch', '--no-tags', 'origin', pr.baseRefOid, pr.headRefOid], { stdio: 'pipe' });
      const mergeBase = execFileSync('git', ['-C', repo, 'merge-base', pr.baseRefOid, pr.headRefOid], { encoding: 'utf8' }).trim();
      const { digest } = await import('../src/core.ts');
      options = { ...options, base: mergeBase, head: pr.headRefOid, id: values.id ?? `pr-${digest(repo).slice(0, 8)}-${pr.number}`, title: values.title ?? pr.title };
    }
    const data = await capture(options);
    console.log(JSON.stringify({ reviewId: data.snapshot.reviewId, snapshotId: data.snapshot.id, files: data.snapshot.files.length, units: data.snapshot.units.length, plan: data.plan }, null, 2));
  } else if (command === 'demo') {
    if (!['1', '2'].includes(values.revision)) throw new Error('Demo revision must be 1 or 2');
    await demo(Number(values.revision));
    await launch('demo');
  } else if (command === 'open') {
    if (!reviewId) throw new Error('Review ID required');
    await launch(reviewId);
  } else if (command === 'inspect') {
    const data = await loadReview(reviewId);
    console.log(JSON.stringify(data, null, 2));
  } else if (command === 'plan') {
    if (!values.file) throw new Error('--file is required');
    await applyPlan(reviewId, JSON.parse(await readFile(values.file, 'utf8')));
    console.log('Plan valid: every change is covered exactly once.');
  } else if (command === 'notes') {
    const data = await loadReview(reviewId);
    console.log(exportNotes(data.state.notes, data.plan));
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(`user-review: ${error.message}`);
  process.exitCode = 1;
}
