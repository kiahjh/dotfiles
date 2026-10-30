import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME, loadReview, reviewDirectory, atomicJSON, validId, withReviewLock } from './core.ts';
import { makeNote } from './core.ts';
import type { Layout } from './model.ts';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const queues = new Map<string, Promise<unknown>>();

async function body(req: IncomingMessage) {
  let size = 0;
  const parts: Buffer[] = [];
  for await (const part of req) {
    size += part.length;
    if (size > 256 * 1024) throw new Error('Request body too large');
    parts.push(part);
  }
  return JSON.parse(Buffer.concat(parts).toString()) as Record<string, unknown>;
}

export function createReviewServer(home = HOME) {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    try {
      const host = req.headers.host ?? '';
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return send(403, { error: 'Local requests only' });
      const url = new URL(req.url ?? '/', `http://${host}`);
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (req.method === 'GET' && url.pathname === '/api/health') return send(200, { app: 'user-review', home });
      if (req.method === 'GET' && url.pathname === '/api/reviews') {
        const entries = await readdir(join(home, 'reviews')).catch(() => []);
        const reviews = await Promise.all(entries.filter(validId).map(async id => {
          try { const { snapshot } = await loadReview(id, home); return { id, title: snapshot.title, createdAt: snapshot.createdAt, units: snapshot.units.length }; }
          catch { return null; }
        }));
        return send(200, reviews.filter(Boolean).sort((a, b) => b!.createdAt.localeCompare(a!.createdAt)));
      }
      if (parts[0] === 'api' && parts[1] === 'reviews' && validId(parts[2] ?? '')) {
        const id = parts[2];
        if (req.method === 'GET' && parts.length === 3) return send(200, await loadReview(id, home));
        if (req.method === 'GET' && parts[3] === 'assets' && parts.length === 5) {
          if (!/^[a-f0-9]{64}(\.[a-z0-9]{1,10})?$/.test(parts[4])) return send(400, { error: 'Invalid asset' });
          const asset = join(reviewDirectory(id, home), 'assets', parts[4]);
          const data = await readFile(asset);
          const image = /^image\//.test(mime[extname(asset)] ?? '');
          // Captured JS/HTML are source artifacts, never executable app assets.
          res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
          if (!image) res.setHeader('Content-Disposition', 'attachment');
          res.writeHead(200, { 'Content-Type': image ? mime[extname(asset)] : 'application/octet-stream' });
          return res.end(data);
        }
        if (req.method === 'POST' && parts[3] === 'actions' && parts.length === 4) {
          // Custom header + same-origin checks prevent cross-site forms/fetches
          // from mutating local notes. No generic filesystem or shell API.
          if (req.headers['x-user-review'] !== '1' || req.headers['content-type'] !== 'application/json'
            || (req.headers.origin && req.headers.origin !== `http://${host}`)) return send(403, { error: 'Same-origin JSON requests required' });
          const input = await body(req);
          const run = (queues.get(`${home}:${id}`) ?? Promise.resolve()).catch(() => {}).then(() => withReviewLock(reviewDirectory(id, home), async () => {
            const data = await loadReview(id, home);
            if (input.snapshotId !== data.snapshot.id) return { conflict: true };
            const state = data.state;
            switch (input.type) {
              case 'review': {
                if (!Array.isArray(input.ids) || typeof input.reviewed !== 'boolean') throw new Error('Invalid review action');
                for (const unitId of input.ids) {
                  if (typeof unitId !== 'string' || !data.snapshot.units.some(u => u.id === unitId)) throw new Error('Unknown review unit');
                  state.reviewed[unitId] = input.reviewed;
                  if (input.reviewed) delete state.flags[unitId];
                }
                break;
              }
              case 'note-add': state.notes.push(makeNote(data.snapshot, input as unknown as Parameters<typeof makeNote>[1])); break;
              case 'note-edit': {
                const note = state.notes.find(n => n.id === input.id);
                if (!note || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 20000) throw new Error('Invalid note');
                note.text = input.text.trim(); break;
              }
              case 'note-delete': state.notes = state.notes.filter(n => n.id !== input.id); break;
              case 'layout':
                if (!['auto', 'split', 'unified'].includes(input.layout as string)) throw new Error('Invalid layout');
                state.layout = input.layout as Layout; break;
              case 'wrap':
                if (typeof input.wrapLines !== 'boolean') throw new Error('Invalid line wrapping');
                state.wrapLines = input.wrapLines; break;
              default: throw new Error('Unknown action');
            }
            await atomicJSON(join(reviewDirectory(id, home), 'states', `${data.snapshot.id}.json`), state);
            return { state };
          }));
          queues.set(`${home}:${id}`, run);
          try {
            const result = await run;
            return send(result.conflict ? 409 : 200, result);
          } finally { if (queues.get(`${home}:${id}`) === run) queues.delete(`${home}:${id}`); }
        }
        return send(404, { error: 'Unknown review endpoint' });
      }
      if (req.method !== 'GET') return send(405, { error: 'Method not allowed' });
      if (parts[0] === 'api') return send(404, { error: 'Unknown endpoint' });
      const target = resolve(DIST, '.' + decodeURIComponent(url.pathname));
      if (target !== DIST && !target.startsWith(DIST + sep)) return send(403, { error: 'Invalid path' });
      if (extname(target)) return await serveFile(target, res);
      return await serveFile(join(DIST, 'index.html'), res);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      send(code === 'ENOENT' ? 404 : 400, { error: code === 'ENOENT' ? 'Review or asset not found' : (error as Error).message });
    }
  });
}

async function serveFile(path: string, res: ServerResponse) {
  const data = await readFile(path);
  res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' });
  res.end(data);
}

export async function serve(port = 4731, home = HOME) {
  const server = createReviewServer(home);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
