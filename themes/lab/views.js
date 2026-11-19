// App previews. Every color is a palette role (`var(--role)`), mapped the way
// each port maps it: Neovim as lua/theme/init.lua does, OpenCode and Xcode from
// the generator's tables (sent by the lab server). Elements carry data-fg /
// data-bg roles so the lab can say what you're pointing at.

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const v = (role) => `var(--${role})`;

// A span colored by a role, with optional background and style.
function s(role, text, { bg, bold, italic, under } = {}) {
  const style = [`color:${v(role)}`, bg && `background:${v(bg)}`, bold && 'font-weight:700', italic && 'font-style:italic',
    under && `text-decoration:underline wavy ${v(under)};text-underline-offset:3px`].filter(Boolean).join(';');
  return `<span data-fg="${role}"${bg ? ` data-bg="${bg}"` : ''} style="${style}">${escape(text)}</span>`;
}

// A tiny Python tokenizer: enough for realistic highlighting of the samples.
const PYTHON_KEYWORDS = new Set(['and', 'as', 'def', 'class', 'else', 'elif', 'except', 'for', 'if', 'in', 'is', 'not', 'or', 'try', 'with', 'while', 'lambda', 'pass', 'break', 'continue', 'global', 'yield']);
const PYTHON_BUILTINS = new Set(['len', 'print', 'isinstance', 'sorted', 'next', 'str', 'int', 'dict', 'list', 'set', 'open', 'range', 'getattr']);

export function tokenizePython(line) {
  const pattern = /(#.*$)|("""[^]*?"""|f?"(?:\\.|[^"\\])*"|f?'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(==|!=|<=|>=|->|[-+*/%=<>])|([()[\]{}:,.])|(\s+)|(.)/g;
  const tokens = [];
  let match, previous = '';
  while ((match = pattern.exec(line))) {
    const [text, comment, string, number, name, operator, punct] = match;
    let token = 'variable';
    if (comment) token = 'comment';
    else if (string) token = 'string';
    else if (number) token = 'number';
    else if (operator) token = 'operator';
    else if (punct) token = 'punct';
    else if (name) {
      const after = line.slice(pattern.lastIndex).trimStart()[0];
      const last = tokens.findLast(([kind]) => kind !== 'space');
      if (name === 'return' || name === 'raise') token = 'keyword.return';
      else if (name === 'import' || name === 'from') token = 'keyword.import';
      else if (PYTHON_KEYWORDS.has(name)) token = 'keyword';
      else if (name === 'True' || name === 'False') token = 'boolean';
      else if (name === 'None') token = 'constant.builtin';
      else if (name === 'self') token = 'variable.builtin';
      else if (previous === 'def') token = 'function';
      else if (previous === 'class' || /^[A-Z]/.test(name)) token = 'type';
      else if (last?.[1] === '.') token = after === '(' ? 'method' : 'property';
      else if (after === '(') token = PYTHON_BUILTINS.has(name) ? 'function.builtin' : 'function.call';
      previous = name;
    } else token = text.trim() ? 'variable' : 'space';
    tokens.push([token, text]);
  }
  return tokens;
}

// lua/theme/init.lua: Kanagawa's tree-sitter groups with our `syn` table.
const NEOVIM = {
  comment: ['muted', { italic: true }], string: ['string'], number: ['number'],
  boolean: ['warning', { bold: true }], 'constant.builtin': ['constant'],
  keyword: ['keyword'], 'keyword.return': ['brightRed'], 'keyword.import': ['red'],
  function: ['function', { italic: true }], 'function.call': ['function', { italic: true }], method: ['function', { italic: true }],
  'function.builtin': ['brightBlue'], type: ['type'], property: ['property'], variable: ['foreground'],
  'variable.builtin': ['keyword', { italic: true }], operator: ['operator'], punct: ['punctuation'], space: ['foreground'],
};

function opencodeRole(token, syntax) {
  const kind = { 'keyword.return': 'keyword', 'keyword.import': 'keyword', 'function.call': 'function', method: 'function',
    'function.builtin': 'function', boolean: 'number', 'constant.builtin': 'number', 'variable.builtin': 'variable',
    property: 'variable', punct: 'punctuation', space: 'variable' }[token] || token;
  return syntax[kind] || 'foreground';
}

const highlight = (line, roleFor) => tokenizePython(line).map(([token, text]) => {
  const [role, style] = roleFor(token);
  return s(role, text, style);
}).join('');

const PYTHON = [
  'def advance_wallpaper(name):',
  '    """Each switch to a theme shows its next wallpaper."""',
  '    files = wallpapers(name)',
  '    if not files:',
  '        return',
  '    state = load_state()',
  '    shown = state.get("wallpapers", {}).get(name)',
  '    names = [path.name for path in files]',
  '    following = names[(names.index(shown) + 1) % len(names)] if shown in names else names[0]',
  '    state.setdefault("wallpapers", {})[name] = following',
  '    save_state(state)',
  '',
  '',
  'def apply_rex(p):',
  '    if not shutil.which("rex"):',
  '        raise Skipped("rex isn\'t installed")',
  '    try:',
  '        clients = json.loads(run("rex", "client", "ls", "--json"))["clients"]',
  '    except (subprocess.CalledProcessError, ValueError):',
  '        raise Skipped("Rex isn\'t running") from None',
  '    apps = [c for c in clients if c.get("info", {}).get("kind") == "app"]',
  '    unused = True',
  '    return ", ".join(app["info"]["label"] for app in apps)',
  '',
  '',
  'def apply_opencode(p):',
  '    themes = config_dir() / "opencode/themes"',
];

// Fixed brand colors, as nvim-web-devicons draws them regardless of theme.
const DEVICON = { py: ['\ue606', '#ffbc03'], json: ['\ue60b', '#cbcb41'], md: ['\ue609', '#dddddd'], lua: ['\ue620', '#51a0cf'], just: ['\uf0ad', '#6d8086'] };

function neovim() {
  const tree = [
    [0, 'dir-open', '.dotfiles', ''], [1, 'dir-open', 'themes', '?'], [2, 'dir-open', 'kiahgawa', ''],
    [3, 'json', 'palette.json', ''], [3, 'dir', 'wallpapers', ''], [2, 'dir-open', 'scripts', 'M'],
    [3, 'py', 'generate.py', ''], [3, 'py', 'lab.py', ''], [3, 'py', 'theme.py', 'M', true],
    [2, 'md', 'README.md', ''], [1, 'dir', 'nvim', ''], [1, 'dir', 'opencode', ''], [1, 'dir', 'rex', ''],
    [1, 'just', 'justfile', 'M'], [1, 'md', 'AGENTS.md', ''],
  ].map(([depth, kind, name, git, cursor]) => {
    const dir = kind.startsWith('dir');
    const [glyph, color] = dir ? [kind === 'dir-open' ? '\ue5fe' : '\ue5ff', null] : DEVICON[kind];
    const icon = dir ? s('blue', glyph) : `<span style="color:${color}">${glyph}</span>`;
    const label = depth === 0 ? s('accent', ` ${name}`, { bold: true }) : s(git ? 'yellow' : dir ? 'foreground' : 'foreground', name, { bold: dir });
    return `<div class="nv-line${cursor ? ' nv-tree-cursor' : ''}" ${cursor ? 'data-bg="raised"' : ''}>${'  '.repeat(depth)}${depth ? (dir ? s('disabled', kind === 'dir-open' ? '\uf47c ' : '\uf460 ') : '  ') + icon + ' ' : ''}${label}${git ? `<span class="nv-git">${s('yellow', git)}</span>` : ''}</div>`;
  }).join('');

  const signs = { 3: 'green', 6: 'yellow', 7: 'yellow', 21: 'green' };
  const cursor = 15;
  const lines = PYTHON.map((text, i) => {
    const n = i + 1;
    const current = n === cursor;
    let code = highlight(text, (token) => NEOVIM[token] || ['foreground']);
    if (n === 22) {
      code = code.replace('style="color:var(--foreground)">unused<', 'style="color:var(--foreground);text-decoration:underline wavy var(--warning);text-underline-offset:3px">unused<');
      code += `    ${s('warning', '■ Local variable `unused` is assigned to but never used')}`;
    }
    if (n === 18) code += `    ${s('error', '■ "run" is not defined')}`;
    if (n === 7) code = code.replace('"wallpapers"', `<mark data-bg="search" style="background:var(--search);color:inherit">"wallpapers"</mark>`);
    const sign = signs[n] ? s(signs[n], '▎') : ' ';
    const number = current ? s('accent', String(n).padStart(3), { bold: true }) : s('disabled', String(n).padStart(3));
    return `<div class="nv-line${current ? ' nv-cursorline' : ''}"${current ? ' data-bg="panel"' : ''}>${sign}${number} ${code || ' '}</div>`;
  }).join('');

  const menu = [['\uea8c', 'which', 'Method', true], ['\u{f0295}', 'which_module', 'Function'], ['\uea8b', 'whichdb', 'Module'], ['\uea88', 'width', 'Variable']]
    .map(([icon, name, kind, selected]) => `<div class="nv-pmenu-item"${selected ? ' data-bg="selection" style="background:var(--selection)"' : ''}>${s(kind === 'Method' || kind === 'Function' ? 'blue' : kind === 'Module' ? 'cyan' : 'foreground', icon)} ${s(selected ? 'brightForeground' : 'foreground', name.padEnd(14))}${s('muted', kind)}</div>`).join('');

  return `<div class="nv" data-bg="background" style="background:var(--background);color:var(--foreground)">
    <div class="nv-main">
      <div class="nv-tree" data-bg="panel" style="background:var(--panel)">${tree}</div>
      <div class="nv-split" style="background:var(--black)"></div>
      <div class="nv-editor">${lines}
        <div class="nv-pmenu" data-bg="panel" style="background:var(--panel);top:calc(${cursor} * var(--lh));left:calc(23ch)">${menu}<div class="nv-pmenu-thumb" style="background:var(--scrollbar)"></div></div>
      </div>
    </div>
    <div class="nv-lualine">
      ${s('background', ' NORMAL ', { bg: 'accent', bold: true })}${s('accent', ' \ue0a0 master ', { bg: 'raised' })}${s('green', ' +3', { bg: 'raised' })}${s('yellow', ' ~1 ', { bg: 'raised' })}<span class="nv-fill" data-bg="inset" style="background:var(--inset)">${s('foreground', ' theme.py ●')}</span>${s('foreground', 'python ', { bg: 'inset' })}${s('accent', ' 48% ', { bg: 'raised' })}${s('background', ' 15:22 ', { bg: 'accent', bold: true })}
    </div>
    <div class="nv-cmdline">${s('foreground', '"themes/scripts/theme.py" 214L, 8127B written')}</div>
  </div>`;
}

// OpenCode's TUI, using its theme roles: raised surfaces are panel/raised/selection.
function opencode(roles) {
  const syntax = roles.opencode.syntax, md = roles.opencode.markdown;
  const code = (text) => highlight(text, (token) => [opencodeRole(token, syntax)]);
  const diff = [
    ['context', 92, 92, '    shown = state.get("wallpapers", {}).get(name)'],
    ['removed', 93, '', '    following = names[0]'],
    ['added', '', 93, '    names = [path.name for path in files]'],
    ['added', '', 94, '    following = names[(names.index(shown) + 1) % len(names)] if shown in names else names[0]'],
    ['context', 94, 95, '    state.setdefault("wallpapers", {})[name] = following'],
  ].map(([kind, old, next, text]) => {
    const bg = { added: 'diffAdded', removed: 'diffRemoved' }[kind] || 'panel';
    const numberBg = { added: 'diffAddedLine', removed: 'diffRemovedLine' }[kind] || 'panel';
    const sign = { added: s('green', '+'), removed: s('red', '-') }[kind] || ' ';
    return `<div class="oc-diff-row" data-bg="${bg}" style="background:var(--${bg})"><span class="oc-num" data-bg="${numberBg}" style="background:var(--${numberBg})">${s('muted', String(old).padStart(3))} ${s('muted', String(next).padStart(3))}</span> ${sign} ${code(text)}</div>`;
  }).join('');
  const bar = (role) => `<i class="oc-bar" style="background:var(--${role})"></i>`;
  return `<div class="oc" data-bg="background" style="background:var(--background);color:var(--foreground)">
    <div class="oc-scroll">
      <div class="oc-block oc-user" data-bg="panel" style="background:var(--panel)">${bar('accent')}${s('foreground', 'can switching to a theme rotate through its wallpapers?')}</div>
      <p>${s('accent', '+ Thought')}${s('muted', ' · 3.5s')}</p>
      <p>${s(md.text, 'Yes. Each switch to a theme now shows its ')}${s(md.strong, 'next', { bold: true })}${s(md.text, ' wallpaper, and the choice is kept in ')}${s(md.code, 'state.json')}${s(md.text, ':')}</p>
      <div class="oc-tool">${s('muted', '← Edit ')}${s('foreground', 'themes/scripts/theme.py')}</div>
      <div class="oc-diff" data-bg="panel" style="background:var(--panel)">${diff}</div>
      <div class="oc-block" data-bg="panel" style="background:var(--panel)">${bar('border')}${s('foreground', '$ just themes-test')}<br>${s('muted', 'Ran 30 tests in 2.9s')}<br>${s('muted', 'OK')}</div>
      <p>${s(md.heading, '## Where it stands', { bold: true })}</p>
      <p>${s(md.listItem, '- ')}${s(md.strong, 'Rex', { bold: true })}${s(md.text, ' reimports the theme and keeps it selected.')}</p>
      <p>${s(md.listItem, '- ')}${s(md.strong, 'OpenCode', { bold: true })}${s(md.text, ' switches by name; see ')}${s(md.link, 'the README', { under: md.link })}${s(md.text, '.')}</p>
      <p>${s(md.listEnumeration, '1. ')}${s(md.emphasis, 'Restart once', { italic: true })}${s(md.text, ' after adding a theme.')}</p>
      <p class="oc-quote">${s(md.horizontalRule, '▍')}${s(md.blockQuote, 'Palette edits show up after the next launch.')}</p>
      <p>${s('error', '✗ ')}${s('muted', 'Wallpaper ')}${s('error', 'Not authorized to send Apple events')}</p>
      <p>${s('accent', 'Build', { bold: true })}${s('muted', ' · Opus 5.5 · 1m 13s')}</p>
    </div>
    <div class="oc-prompt" data-bg="panel" style="background:var(--panel)">${bar('accent')}<div><span class="oc-cursor" style="background:var(--foreground)"></span>${s('muted', ' Ask anything…')}</div><div>${s('accent', 'Build', { bold: true })}${s('muted', ' · ')}${s('foreground', 'Opus 5.5')}${s('muted', ' Claude Agent · ')}${s('orange', 'high')}</div></div>
    <div class="oc-footer"><span>${s('accent', '▪▪▪')}${s('disabled', '▪▪▪▪▪')} ${s('foreground', 'esc')} ${s('muted', 'interrupt')}</span><span class="oc-right">${s('muted', '246.3K (25%)')}  ${s('foreground', 'ctrl+l')} ${s('muted', 'commands')}</span></div>
  </div>`;
}

// zsh with oh-my-zsh's robbyrussell prompt; ANSI slots named by palette role.
const prompt = (dir = '.dotfiles', dirty = true) =>
  `${s('green', '➜', { bold: true })}  ${s('cyan', dir, { bold: true })} ${s('blue', 'git:(', { bold: true })}${s('red', 'master', { bold: true })}${s('blue', ')', { bold: true })}${dirty ? ` ${s('yellow', '✗')}` : ''} `;

function shell() {
  return [
    `${prompt()}${s('foreground', 'theme set kiahgawa')}`,
    s('foreground', 'kiahgawa (dark)'),
    `  ${s('green', '✓')} ${s('foreground', 'macOS      dark appearance')}`,
    `  ${s('green', '✓')} ${s('foreground', 'Wallpaper  forest.png')}`,
    `  ${s('green', '✓')} ${s('foreground', 'Rex        Kiah’s MacBook Pro')}`,
    `  ${s('muted', '–')} ${s('foreground', 'Xcode      ')}${s('muted', 'Xcode isn’t set up')}`,
    `${prompt()}${s('foreground', 'git status -sb')}`,
    `${s('foreground', '## ')}${s('green', 'master')}${s('foreground', '...')}${s('red', 'origin/master')}${s('foreground', ' [ahead ')}${s('green', '2')}${s('foreground', ']')}`,
    `${s('green', 'M')}${s('red', ' ')} ${s('foreground', 'AGENTS.md')}`,
    ` ${s('red', 'M')} ${s('foreground', 'justfile')}`,
    `${s('red', '??')} ${s('foreground', 'themes/')}`,
    `${prompt()}<span class="term-cursor" data-bg="accent" style="background:var(--accent)"></span>`,
  ].map((line) => `<div>${line}</div>`).join('');
}

function rexPane(title, body, { focused = false, bg = 'terminalBackground', icon = '' } = {}) {
  return `<section class="rx-pane${focused ? ' focused' : ''}" data-bg="${bg}" style="background:var(--${bg})">
    <header>${s('muted', icon)} ${s('foreground', title)}<span class="rx-pane-tools">${s('disabled', '▯ ▭ ⧉ ⤢ ✕')}</span></header>
    <div class="rx-body">${body}</div>
  </section>`;
}

export function workspace(roles) {
  return `<div class="window rx" data-bg="background" style="background:var(--background)">
    <div class="rx-titlebar"><span class="lights"><i></i><i></i><i></i></span>
      <span class="rx-chip">${s('muted', '▢')} ${s('foreground', 'dotfiles')}</span>
      <span class="rx-chip rx-tab" data-bg="raised" style="background:var(--raised)">${s('accent', '◆')} ${s('foreground', 'OC | Kiahgawa colors', { bold: true })} ${s('muted', '⋯')}</span>
      <span class="rx-spacer"></span>${s('muted', '◉   ⌘   +')}
    </div>
    <div class="rx-panes">
      ${rexPane('OC | Kiahgawa colors', opencode(roles), { focused: true, bg: 'background', icon: '▣' })}
      <div class="rx-column">
        ${rexPane('Neovim ~/.dotfiles', neovim(), { bg: 'background', icon: 'N' })}
        ${rexPane('zsh ~/.dotfiles', `<div class="term">${shell()}</div>`, { icon: '›_' })}
      </div>
    </div>
  </div>`;
}

export function terminal(ansi) {
  const lsRows = [
    ['drwxr-xr-x', '15', '480', 'Nov 18 12:08', 'blue', 'themes', true],
    ['drwxr-xr-x', ' 6', '192', 'Nov 16 13:41', 'blue', 'nvim', true],
    ['-rwxr-xr-x', ' 1', '102', 'Nov 18 11:42', 'green', 'theme', true],
    ['lrwxr-xr-x', ' 1', ' 56', 'Nov 18 12:08', 'purple', 'kiahgawa.json', false, ' -> ~/.local/share/themes/kiahgawa/opencode.json'],
    ['-rw-r--r--', ' 1', '2.1K', 'Nov 18 12:10', 'foreground', 'justfile', false],
  ].map(([mode, links, size, date, role, name, bold, target = '']) =>
    `<div>${s('foreground', `${mode} ${links} miciah staff ${size.padStart(4)} ${date} `)}${s(role, name, { bold })}${s('foreground', target)}</div>`).join('');
  const log = [
    ['8f3c2d1', ['HEAD -> ', 'cyan'], ['master', 'green'], 'Move Kiahgawa into dotfiles'],
    ['2e19fa7', ['origin/master', 'red'], null, 'gt: ask Rex task questions in the command palette'],
    ['752d9dd', null, null, 'opencode: use Exa for web search'],
  ].map(([hash, ref, branch, message]) => `<div>${s('red', '* ')}${s('yellow', hash)} ${ref ? `${s('yellow', '(')}${s(ref[1], ref[0], { bold: true })}${branch ? s(branch[1], branch[0], { bold: true }) : ''}${s('yellow', ')')} ` : ''}${s('foreground', message)}</div>`).join('');
  const tests = `<div>${s('background', ' PASS ', { bg: 'green', bold: true })} ${s('foreground', 'themes/tests/test_generate.py ')}${s('muted', '(0.21s)')}</div>
    <div>${s('background', ' PASS ', { bg: 'green', bold: true })} ${s('foreground', 'themes/tests/test_theme.py ')}${s('muted', '(0.48s)')}</div>
    <div>${s('background', ' FAIL ', { bg: 'red', bold: true })} ${s('foreground', 'scripts/tests/test_gmail.py')}</div>
    <div>${s('red', '  ✕ ')}${s('foreground', 'test_drafts_keep_alternatives ')}${s('muted', '(12 ms)')}</div>
    <div>${s('muted', '    KeyError: ')}${s('brightRed', "'multipart/alternative'")}</div>
    <div>${s('yellow', 'warning')}${s('foreground', ': 1 test skipped (')}${s('cyan', 'Node is optional')}${s('foreground', ')')}</div>
    <div>${s('foreground', 'Tests: ')}${s('red', '1 failed', { bold: true })}${s('foreground', ', ')}${s('green', '29 passed', { bold: true })}${s('foreground', ', 30 total')}</div>`;
  const swatches = (offset) => ansi.slice(offset, offset + 8).map((role, i) =>
    `<div class="ansi-cell"><span class="ansi-swatch" data-bg="${role}" style="background:var(--${role})"></span>${s(role === 'black' ? 'muted' : role, `${String(offset + i).padStart(2)} ${role}`)}</div>`).join('');
  const onColors = ansi.slice(0, 8).map((role) => s(role === 'black' ? 'foreground' : 'black', ` ${role.slice(0, 3)} `, { bg: role })).join('');
  return `<div class="window rx rx-single" data-bg="background" style="background:var(--background)">
    <div class="rx-titlebar"><span class="lights"><i></i><i></i><i></i></span><span class="rx-chip rx-tab" data-bg="raised" style="background:var(--raised)">${s('muted', '›_')} ${s('foreground', 'zsh ~/.dotfiles', { bold: true })}</span><span class="rx-spacer"></span>${s('muted', '◉   ⌘   +')}</div>
    <div class="rx-panes">${rexPane('zsh ~/.dotfiles', `<div class="term">
      <div>${prompt()}${s('foreground', 'ls -la')}</div>${lsRows}
      <div>${prompt()}${s('foreground', 'git log --oneline --graph -3')}</div>${log}
      <div>${prompt()}${s('foreground', 'just test')}</div>${tests}
      <div>${prompt()}${s('foreground', 'colors')}</div>
      <div class="ansi-grid">${swatches(0)}</div><div class="ansi-grid">${swatches(8)}</div>
      <div>${onColors}</div>
      <div>${prompt('.dotfiles', false)}<span class="term-cursor" data-bg="accent" style="background:var(--accent)"></span></div>
    </div>`, { focused: true, icon: '›_' })}</div>
  </div>`;
}

// Xcode 27, colored by generate.XCODE. «token|text» marks a span.
const SWIFT = String.raw`«keyword|import» «plainText|SwiftUI»

«comment|/// Keeps track of the current theme and rotates its wallpapers.»
«comment|/// See» «link|https://developer.apple.com/documentation/observation»
«keyword.attribute|@Observable»
«keyword|final class» «typeDeclaration|ThemeStore» {
    «keyword|private(set) var» «plainText|current»: «projectType|Theme»? = «keyword|nil»
    «keyword|let» «plainText|themes»: [«projectType|Theme»]
    «keyword|var» «plainText|wallpaperIndex» = «number|0»

    «keyword|init»(«plainText|themes»: [«projectType|Theme»]) {
        «keyword|self».«projectMember.variable|themes» = «plainText|themes»
    }

    «keyword.attribute|@MainActor»
    «keyword|func» «plainText|apply»(«plainText|_ theme»: «projectType|Theme») «keyword|async throws» {
        «keyword|guard» «projectMember.variable|themes».«otherMember.function|contains»(«plainText|theme») «keyword|else» {
            «keyword|throw» «projectType|ThemeError».«projectMember.constant|unknown»(«plainText|theme».«projectMember.variable|name»)
        }
        «keyword|let» «plainText|files» = «keyword|try» «projectMember.function|wallpapers»(«plainText|for»: «plainText|theme»)
        «projectMember.variable|wallpaperIndex» = («projectMember.variable|wallpaperIndex» + «number|1») % «plainText|files».«otherMember.variable|count»
        «keyword|let» «plainText|delay»: «otherType|Duration» = .«otherMember.function|milliseconds»(«number|250»)
        «keyword|let» «plainText|tint» = «otherType|Color»(«plainText|hex»: «string|"#d3be8e"»)
«preprocessor|#if» «preprocessor.macro|DEBUG»
        «otherMember.function|print»(«string|"Applying \(»«plainText|theme».«projectMember.variable|name»«string|)"»)
«preprocessor|#endif»
        «projectMember.variable|current» = «plainText|theme»
    }
}`;

export function xcode(roles) {
  const map = roles.xcode;
  const lines = SWIFT.split('\n').map((line, i) => {
    const html = line.split(/(«[\w.]+\|[^»]*»)/).map((part) => {
      const match = part.match(/^«([\w.]+)\|([^»]*)»$/);
      if (!match) return s(map.plainText, part);
      return s(map[match[1]] || map.plainText, match[2], { italic: match[1] === 'comment' });
    }).join('');
    const n = i + 1;
    const warning = n === 22 ? `<span class="xc-issue" data-bg="warning">⚠︎ Initialization of immutable value 'delay' was never used</span>` : '';
    return `<div class="xc-line${n === 16 ? ' xc-current' : ''}"><span class="xc-num">${n}</span><span class="xc-code">${html || ' '}</span>${warning}</div>`;
  }).join('');
  const files = [['Gertrude', 0, 'project'], ['Sources', 1, 'folder'], ['Theme.swift', 2, 'swift'], ['ThemeStore.swift', 2, 'swift', true],
    ['WallpaperView.swift', 2, 'swift'], ['Resources', 1, 'folder'], ['Tests', 1, 'folder'], ['Package.swift', 1, 'swift']]
    .map(([name, depth, kind, selected]) => `<div class="xc-file${selected ? ' selected' : ''}" style="padding-left:${10 + depth * 14}px"><span class="xc-icon ${kind}"></span>${escape(name)}</div>`).join('');
  return `<div class="window xc" data-bg="background" style="background:var(--background);color:var(--foreground)">
    <div class="xc-toolbar"><span class="lights"><i></i><i></i><i></i></span><span class="xc-glyphs">☰ ▶ ■</span>
      <span class="xc-scheme">Gertrude › My Mac</span><span class="xc-status">Build Succeeded | Today at 12:08</span><span class="xc-warn">⚠︎ 1</span></div>
    <div class="xc-main">
      <aside class="xc-nav"><div class="xc-nav-tabs">▤ ⌧ ⌑ ⌕ ⚠︎ ◇ ⊘ ▭</div>${files}</aside>
      <div class="xc-editor">
        <div class="xc-jump">Gertrude › Sources › ThemeStore.swift › No Selection</div>
        <div class="xc-code-area">${lines}</div>
        <div class="xc-statusbar">Line: 16  Col: 9</div>
      </div>
    </div>
  </div>`;
}
