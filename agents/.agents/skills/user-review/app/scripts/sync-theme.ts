import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const source = process.argv[2] ?? join(homedir(), 'active-projects/kiahgawa/palette/kiahgawa.json');
const palette = JSON.parse(await readFile(source, 'utf8'));
if (palette.name !== 'kiahgawa' || !Object.entries(palette).every(([key, value]) => key === 'name' || /^#[0-9a-f]{6}$/i.test(String(value)))) throw new Error('Invalid Kiahgawa palette');
await writeFile(new URL('../src/palette.json', import.meta.url), JSON.stringify(palette, null, 2) + '\n');
console.log(`Synced palette from ${source}`);
