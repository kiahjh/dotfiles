import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { capture, applyPlan, HOME } from './core.ts';
import type { Plan } from './model.ts';

export async function demo(revision = 1, home = HOME) {
  const repo = join(home, 'demo-repository');
  const marker = join(repo, '.user-review-demo');
  let exists = false;
  try { await access(repo); exists = true; } catch {}
  if (exists) await access(marker); // Never overwrite an unrelated directory.
  const put = async (name: string, text: string) => {
    await mkdir(join(repo, name, '..'), { recursive: true });
    await writeFile(join(repo, name), text);
  };
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
  if (!exists) {
    await mkdir(repo, { recursive: true });
    await writeFile(marker, 'Synthetic User Review fixture. Safe to regenerate.\n');
    git('init', '-q');
    await put('src/session.ts', 'export interface Session {\n  id: string;\n  title: string;\n}\n');
    await put('src/storage.ts', 'import type { Session } from "./session";\n\nexport function restoreSession(raw: string): Session {\n  return JSON.parse(raw);\n}\n');
    await put('src/SessionTabs.tsx', 'import type { Session } from "./session";\n\nexport function SessionTabs({ sessions }: { sessions: Session[] }) {\n  return <nav>{sessions.map(session => <button key={session.id}>{session.title}</button>)}</nav>;\n}\n');
    await put('tests/storage.test.ts', 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { restoreSession } from "../src/storage";\n\ntest("restores a saved session", () => {\n  assert.equal(restoreSession(\'{"id":"a","title":"First"}\').id, "a");\n});\n');
    await put('assets/tabs.svg', svg(false));
    await put('package-lock.json', '{\n  "name": "session-tabs",\n  "lockfileVersion": 2\n}\n');
    await put('legacy.txt', 'Use the most recently opened session.\n');
    git('add', '.');
    git('-c', 'user.name=User Review Demo', '-c', 'user.email=demo@example.invalid', 'commit', '-qm', 'Synthetic review baseline');
  }
  const second = revision === 2;
  await put('src/session.ts', 'export interface Session {\n  id: string;\n  title: string;\n  lastVisitedAt?: number;\n}\n');
  await put('src/storage.ts', `${second ? '// Preserve older sessions without rewriting their original timestamps.\n\n' : ''}import type { Session } from "./session";\n\nexport function restoreSession(raw: string): Session {\n  const value: unknown = JSON.parse(raw);\n  if (!value || typeof value !== "object" || !("id" in value)) {\n    throw new Error("Invalid session payload");\n  }\n  const session = value as Session;\n  return { ...session, lastVisitedAt: session.lastVisitedAt ?? ${second ? '0' : 'Date.now()'} };\n}\n`);
  await put('src/SessionTabs.tsx', 'import type { Session } from "./session";\n\nexport function SessionTabs({ sessions }: { sessions: Session[] }) {\n  const ordered = [...sessions].sort((a, b) => (b.lastVisitedAt ?? 0) - (a.lastVisitedAt ?? 0));\n  return (\n    <nav aria-label="Recent sessions">\n      {ordered.map(session => <button key={session.id}>{session.title}</button>)}\n    </nav>\n  );\n}\n');
  await put('tests/storage.test.ts', 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { restoreSession } from "../src/storage";\n\ntest("restores a saved session", () => {\n  assert.equal(restoreSession(\'{"id":"a","title":"First"}\').id, "a");\n});\n\ntest("retains a saved visit timestamp", () => {\n  assert.equal(restoreSession(\'{"id":"a","title":"First","lastVisitedAt":42}\').lastVisitedAt, 42);\n});\n\ntest("rejects a malformed payload", () => {\n  assert.throws(() => restoreSession("null"), /Invalid session/);\n});\n');
  await put('assets/tabs.svg', svg(true));
  await put('package-lock.json', '{\n  "name": "session-tabs",\n  "lockfileVersion": 3\n}\n');
  await put('docs/restoration.md', '# Restoring sessions\n\nOlder sessions remain readable. Recent sessions are shown first.\n');
  // Synthetic deleted file and binary fixture.
  const { unlink } = await import('node:fs/promises');
  await unlink(join(repo, 'legacy.txt')).catch(() => {});
  await writeFile(join(repo, 'assets/state.bin'), Buffer.from([0, 1, 2, 255]));
  if (!second) {
    await put('notes.txt', 'A new file can be reviewed without staging it.\n');
  }
  const data = await capture({ repo, id: 'demo', title: 'Restore sessions without losing your place', home });
  const groups: { title: string; description?: string; paths: string[] }[] = [
    { title: 'Session type', description: 'Optional for existing saved sessions.', paths: ['src/session.ts'] },
    { title: 'Restoration & tab order', paths: ['src/storage.ts', 'src/SessionTabs.tsx'] },
    { title: 'Tests', paths: ['tests/storage.test.ts'] },
    { title: 'UI', paths: ['assets/tabs.svg'] },
    { title: 'Other changes', paths: [] },
  ];
  const used = new Set<string>();
  const plan: Plan = { schema: 1, snapshotId: data.snapshot.id, curated: true,
    summary: 'Restore saved visit timestamps and sort session tabs by recency.',
    chapters: groups.map((group, index) => ({ id: `chapter-${index + 1}`, title: group.title, description: group.description,
      items: data.snapshot.units.filter(unit => {
        const path = data.snapshot.files.find(f => f.id === unit.fileId)!.path;
        return group.paths.length ? group.paths.includes(path) : !used.has(unit.id);
      }).sort((a, b) => group.paths.indexOf(data.snapshot.files.find(f => f.id === a.fileId)!.path) - group.paths.indexOf(data.snapshot.files.find(f => f.id === b.fileId)!.path)).map(unit => {
        used.add(unit.id);
        const path = data.snapshot.files.find(f => f.id === unit.fileId)!.path;
        return { unitId: unit.id, expanded: !/lock|\.bin$/.test(path),
          emphasis: path === 'src/storage.ts' ? 'attention' : /lock/.test(path) ? 'mechanical' : 'normal',
          explanation: path === 'src/storage.ts' ? 'Check ordering for sessions without a timestamp.' : undefined };
      }) })) };
  await applyPlan('demo', plan, home);
  return { ...data, plan };
}

function svg(updated: boolean) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="250" viewBox="0 0 780 250"><rect width="780" height="250" rx="14" fill="#181616"/><text x="32" y="44" fill="#9da69f" font-family="system-ui" font-size="13">RECENT SESSIONS</text>${(updated ? ['Fix tab restoration', 'Explore browser tools', 'Tidy configuration'] : ['Tidy configuration', 'Explore browser tools', 'Fix tab restoration']).map((title, i) => `<rect x="24" y="${66 + i * 54}" width="732" height="44" rx="7" fill="${i === 0 ? '#393836' : '#252420'}"/><circle cx="45" cy="${88 + i * 54}" r="4" fill="${updated && i === 0 ? '#d3be8e' : '#62685f'}"/><text x="64" y="${94 + i * 54}" fill="#d5d8d0" font-family="system-ui" font-size="15">${title}</text>${updated ? `<text x="660" y="${94 + i * 54}" fill="#9da69f" font-family="system-ui" font-size="12">${['just now', '2h ago', 'yesterday'][i]}</text>` : ''}`).join('')}</svg>`;
}
