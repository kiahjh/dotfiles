import { derived, contrast, validatePalette } from './color.js';
import { workspace, terminal, xcode } from './views.js';

const $ = (selector) => document.querySelector(selector);
const all = (selector) => [...document.querySelectorAll(selector)];
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = (p) => ({ ...p });
const equal = (a, b) => Object.keys(a).every((key) => a[key] === b[key]);
const token = () => $('meta[name="lab-token"]').content;

// Where each color shows up, so editing one doesn't need guesswork.
const groups = {
  Surfaces: {
    background: 'Editor, OpenCode, and Xcode background', terminalBackground: 'Rex terminal panes',
    inset: 'Floats, statusline, inactive windows', panel: 'Sidebars, cursor line, menus, blocks',
    raised: 'Hovered and nested surfaces', selection: 'Selections, selected menu item',
  },
  Text: {
    foreground: 'Main text', brightForeground: 'Bold and selected text', subtle: 'Secondary text, parameters',
    muted: 'Comments, details, ANSI 8', disabled: 'Line numbers, disabled text', border: 'Borders and rules',
    scrollbar: 'Scrollbar thumbs',
  },
  Code: {
    keyword: 'Keywords', property: 'Properties and fields', string: 'Strings', function: 'Functions and methods',
    type: 'Types', number: 'Numbers', constant: 'Constants', operator: 'Operators',
    punctuation: 'Brackets and delimiters', parameter: 'Parameters',
  },
  Colors: {
    accent: 'Accent: cursor, focus, lualine, headings, folders',
    red: 'Deletions, imports, ANSI 1', green: 'Additions, ANSI 2', yellow: 'Git changes, ANSI 3',
    blue: 'Links, ANSI 4', purple: 'ANSI 5', cyan: 'ANSI 6', orange: 'Command mode, charts',
    error: 'Errors', warning: 'Warnings, booleans',
  },
  Terminal: {
    black: 'ANSI 0, darkest surface', brightRed: 'ANSI 9, return, removed words', brightGreen: 'ANSI 10, added words',
    brightYellow: 'ANSI 11', brightBlue: 'ANSI 12, builtins', brightPurple: 'ANSI 13', brightCyan: 'ANSI 14',
  },
};

let draftKey;
let disk, palette, ansi, roles, draftRevision, comparing = false, stale = false, busy = false;
let undo = [], redo = [];
let publishing = false, queuedPreview = null;

function notice(message = '') {
  $('#notice').textContent = message;
}

async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

function changes() {
  return Object.keys(palette).filter((key) => palette[key] !== disk.palette[key]);
}

function remember() {
  try {
    if (changes().length) localStorage.setItem(draftKey, JSON.stringify({ palette, revision: stale ? draftRevision : disk.revision }));
    else localStorage.removeItem(draftKey);
  } catch {
    notice('Browser draft storage is unavailable. Export JSON to keep your candidate.');
  }
}

function updatePreview() {
  const p = derived(comparing ? disk.palette : palette);
  Object.entries(p).forEach(([key, value]) => { if (!['name', 'mode', 'source'].includes(key)) $('#preview').style.setProperty(`--${key}`, value); });
  renderContrast(p);
  const edited = changes();
  $('#edit-count').textContent = `${edited.length} edit${edited.length === 1 ? '' : 's'}`;
  $('#save-state').textContent = busy ? 'Saving…' : stale ? 'Disk changed' : comparing ? 'Showing saved palette' : edited.length ? 'Unsaved changes' : 'Saved';
  $('#save-state').dataset.state = busy ? 'busy' : stale ? 'stale' : comparing ? 'comparing' : edited.length ? 'edited' : 'saved';
  $('#save').disabled = !edited.length || stale || busy;
  $('#undo').disabled = !undo.length || busy;
  $('#redo').disabled = !redo.length || busy;
  $('#reset').disabled = !edited.length || busy;
  $('#compare').setAttribute('aria-pressed', String(comparing));
  all('#palette-editor input, #import, #reload').forEach((control) => { control.disabled = busy; });
  all('.token-row').forEach((row) => row.classList.toggle('changed', edited.includes(row.dataset.key)));
  publishPreview(comparing ? disk.palette : palette);
}

// Serialize publications and coalesce rapid color-picker events. The bridge is
// memory-only; a following terminal sees the same candidate, including compare.
async function publishPreview(p) {
  queuedPreview = clone(p);
  if (publishing) return;
  publishing = true;
  try {
    while (queuedPreview) {
      const next = queuedPreview;
      queuedPreview = null;
      await request('/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ palette: next }) });
    }
  } catch (error) {
    queuedPreview = null;
    notice(`Terminal preview bridge unavailable: ${error.message}. Browser edits are still provisional.`);
  } finally { publishing = false; }
}

function setPalette(next, rebuild = true) {
  if (busy || equal(next, palette)) return;
  validatePalette(next, Object.keys(disk.palette), disk.palette.name);
  undo.push(clone(palette));
  if (undo.length > 150) undo.shift();
  redo = [];
  palette = clone(next);
  // Editing always shows the candidate, not an unchanging baseline.
  comparing = false;
  if (rebuild) renderEditor();
  updatePreview();
  remember();
}

function renderEditor() {
  $('#palette-editor').innerHTML = Object.entries(groups).map(([group, keys]) => `
    <section class="token-group" data-group="${escape(group)}"><h3>${escape(group)}</h3>${Object.entries(keys).map(([key, use]) => `
      <div class="token-row" data-key="${key}">
        <input type="color" value="${palette[key]}" aria-label="${key} color" data-color="${key}">
        <label for="hex-${key}"><span class="token-name">${key}</span><span class="token-use">${escape(use)}</span></label>
        <input class="hex-input" id="hex-${key}" data-hex="${key}" value="${palette[key]}" pattern="#[0-9a-fA-F]{6}" spellcheck="false" aria-label="${key} hex">
      </div>`).join('')}</section>`).join('');
  filterTokens();
}

function filterTokens() {
  const query = $('#token-search').value.toLowerCase().trim();
  all('.token-group').forEach((section) => {
    let visible = 0;
    section.querySelectorAll('.token-row').forEach((row) => {
      row.hidden = !`${section.dataset.group} ${row.dataset.key} ${row.querySelector('.token-use').textContent}`.toLowerCase().includes(query);
      if (!row.hidden) visible++;
    });
    section.hidden = !visible;
  });
}

function renderViews() {
  $('#view-workspace').innerHTML = workspace(roles);
  $('#view-xcode').innerHTML = xcode(roles);
  $('#view-terminal').innerHTML = terminal(ansi);
}

function showView(name) {
  all('[role="tab"]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.view === name)));
  all('.view').forEach((view) => { view.hidden = view.id !== `view-${name}`; });
}

function renderContrast(p) {
  const surfaces = ['background', 'terminalBackground', 'inset', 'panel', 'raised', 'selection'];
  const text = ['foreground', 'brightForeground', 'subtle', 'muted', 'disabled', 'keyword', 'property', 'yellow', 'green', 'blue', 'cyan', 'purple', 'orange', 'red', 'error', 'warning'];
  const grade = (ratio) => ratio >= 7 ? ['AAA', 'pass'] : ratio >= 4.5 ? ['AA', 'pass'] : ratio >= 3 ? ['Large', 'weak'] : ['Fail', 'fail'];
  $('#contrast-matrix').innerHTML = `<table class="data-table"><thead><tr><th>Text on</th>${surfaces.map((key) => `<th><span class="chip" style="background:${p[key]}"></span>${key}</th>`).join('')}</tr></thead><tbody>${text.map((role) => `<tr><th><span class="chip" style="background:${p[role]}"></span>${role}</th>${surfaces.map((surface) => {
    const ratio = contrast(p[role], p[surface]);
    const [label, kind] = grade(ratio);
    return `<td><span class="sample" style="background:${p[surface]};color:${p[role]}">Aa</span><span class="ratio">${ratio.toFixed(2)}</span><span class="grade ${kind}">${label}</span></td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
  $('#contrast-pairs').innerHTML = `<table class="data-table"><thead><tr><th>Pair</th><th>Ratio</th><th>Why it matters</th></tr></thead><tbody>${[
    ['border', 'background', 'Borders need 3:1 to read as boundaries'],
    ['background', 'yellow', 'Text on the accent (lualine mode, buttons)'],
    ['panel', 'background', 'Sidebars and blocks against the editor'],
    ['raised', 'panel', 'Nested surfaces'],
    ['selection', 'panel', 'Selected menu item'],
    ['terminalBackground', 'background', 'Rex panes against OpenCode and Neovim'],
  ].map(([a, b, note]) => `<tr><th><span class="chip" style="background:${p[a]}"></span>${a} / <span class="chip" style="background:${p[b]}"></span>${b}</th><td class="num">${contrast(p[a], p[b]).toFixed(2)}:1</td><td class="note">${note}</td></tr>`).join('')}</tbody></table>`;
}

// Point at anything in a preview to see its colors; click to edit them.
function inspect(event) {
  const fg = event.target.closest('[data-fg]')?.dataset.fg;
  const bg = event.target.closest('[data-bg]')?.dataset.bg;
  const p = derived(comparing ? disk.palette : palette);
  const part = (label, role) => role ? `${label} <b>${role}</b> <code>${p[role] ?? ''}</code>` : '';
  $('#inspect').innerHTML = [part('text', fg), part('surface', bg)].filter(Boolean).join('<span class="sep">·</span>');
  return { fg, bg };
}

function focusToken(key) {
  const row = $(`.token-row[data-key="${key}"]`);
  if (!row) return;  // A derived color such as diffAdded.
  $('#token-search').value = ''; filterTokens();
  all('.token-row.active').forEach((item) => item.classList.remove('active'));
  row.classList.add('active');
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.querySelector('.hex-input').focus({ preventScroll: true });
}

function bindControls() {
  $('#palette-editor').addEventListener('input', (event) => {
    const key = event.target.dataset.color;
    if (!key) return;
    setPalette({ ...palette, [key]: event.target.value.toLowerCase() }, false);
    $(`#hex-${key}`).value = palette[key];
  });
  $('#palette-editor').addEventListener('change', (event) => {
    const key = event.target.dataset.hex;
    if (!key || !event.target.checkValidity()) return;
    setPalette({ ...palette, [key]: event.target.value.toLowerCase() }, false);
    $(`[data-color="${key}"]`).value = palette[key];
    event.target.value = palette[key];
  });
  $('#token-search').addEventListener('input', filterTokens);
  all('[role="tab"]').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
  $('#preview').addEventListener('mousemove', inspect);
  $('#preview').addEventListener('mouseleave', () => { $('#inspect').innerHTML = 'Point at anything to see its colors · click to edit text color · ⌥-click for surface'; });
  $('#preview').addEventListener('click', (event) => {
    const { fg, bg } = inspect(event);
    focusToken(event.altKey ? bg : fg || bg);
  });
  $('#compare').addEventListener('click', () => { comparing = !comparing; updatePreview(); });
  const step = (from, to) => {
    if (!from.length || busy) return;
    to.push(clone(palette)); palette = from.pop(); comparing = false;
    renderEditor(); updatePreview(); remember();
  };
  $('#undo').addEventListener('click', () => step(undo, redo));
  $('#redo').addEventListener('click', () => step(redo, undo));
  $('#reset').addEventListener('click', () => { if (confirm('Discard your changes and go back to the saved palette? You can undo this.')) setPalette(disk.palette); });
  $('#export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(palette, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${palette.name}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 16384) throw new Error('Palette file is too large.');
      setPalette(validatePalette(JSON.parse(await file.text()), Object.keys(disk.palette), disk.palette.name));
      notice('Imported a candidate. Nothing has been saved.');
    } catch (error) { notice(error.message); }
    event.target.value = '';
  });
  $('#reload').addEventListener('click', async () => {
    if (busy || (changes().length && !confirm('Replace your changes with the palette on disk? Export first to keep them.'))) return;
    try {
      disk = await request('/api/state'); palette = clone(disk.palette);
      draftRevision = disk.revision;
      stale = false; comparing = false; undo = []; redo = [];
      renderEditor(); updatePreview(); remember(); notice('Loaded the palette from disk.');
    } catch (error) { notice(error.message); }
  });
  all('.menu button').forEach((button) => button.addEventListener('click', () => { $('.menu').open = false; }));
  $('#save').addEventListener('click', () => {
    const edited = changes();
    $('#save-summary').textContent = `${edited.length} changed: ${edited.join(', ')}.`;
    $('#save-dialog').returnValue = '';
    $('#save-dialog').showModal();
  });
  $('#save-dialog').addEventListener('close', async () => {
    if ($('#save-dialog').returnValue !== 'save' || busy) return;
    busy = true; updatePreview();
    try {
      disk = await request('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ palette, revision: disk.revision }) });
      palette = clone(disk.palette); stale = false; undo = []; redo = [];
      draftRevision = disk.revision;
      remember(); renderEditor(); notice(`Saved ${palette.name}. Neovim follows if it's the current theme; run theme apply for Rex and Xcode.`);
    } catch (error) { notice(error.message); }
    finally { busy = false; updatePreview(); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input,textarea,select,[contenteditable]') || $('#save-dialog').open) return;
    const key = event.key.toLowerCase();
    if (event.metaKey && key === 'z') {
      event.preventDefault(); $(event.shiftKey ? '#redo' : '#undo').click();
    } else if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      if (key === 'b') { event.preventDefault(); comparing = !comparing; updatePreview(); }
      const tab = all('[role="tab"]')[Number(key) - 1];
      if (tab) showView(tab.dataset.view);
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (busy) { event.preventDefault(); event.returnValue = ''; }
  });
}

async function poll() {
  const expectedRevision = disk.revision;
  try {
    const latest = await request('/api/state');
    if (busy || disk.revision !== expectedRevision) return;
    if (latest.revision !== disk.revision) {
      if (!changes().length) {
        disk = latest; palette = clone(latest.palette); stale = false; undo = []; redo = [];
        draftRevision = disk.revision;
        renderEditor(); updatePreview(); remember(); notice('Reloaded: the palette changed on disk.');
      } else if (!stale) {
        stale = true; updatePreview();
        notice('The palette changed on disk. Your changes are kept; export them, then reload from disk before saving.');
      }
    }
  } catch (error) {
    notice(`Live reload unavailable: ${error.message}. Your changes are still here to export.`);
  } finally { setTimeout(poll, 1800); }
}

async function start() {
  try {
    disk = await request('/api/state');
    draftRevision = disk.revision;
    palette = clone(disk.palette); ansi = disk.ansi; roles = disk.roles;
    draftKey = `theme-lab-draft-${disk.palette.name}`;
    document.title = `${disk.palette.name} · Palette lab`;
    $('#theme-name').textContent = disk.palette.name;
    $('#theme-mode').textContent = disk.palette.mode;
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey));
      if (draft) {
        palette = clone(validatePalette(draft.palette, Object.keys(disk.palette), disk.palette.name));
        draftRevision = draft.revision;
        stale = draft.revision !== disk.revision;
        notice(stale ? 'Recovered changes made to an older disk palette. Export them, then reload from disk before saving.' : 'Recovered your unsaved changes.');
      }
    } catch { notice('Unsaved changes from last time couldn’t be restored. The disk palette is loaded.'); }
    renderViews(); renderEditor(); bindControls(); updatePreview();
    $('#preview').dispatchEvent(new Event('mouseleave'));
    setTimeout(poll, 1800);
  } catch (error) {
    notice(`Couldn’t start the lab: ${error.message}. Run theme lab and use its local URL.`);
    $('#save-state').textContent = 'Disconnected';
  }
}

start();
