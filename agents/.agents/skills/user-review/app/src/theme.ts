import { registerCustomTheme, canUseWASM } from '@pierre/diffs';
import p from './palette.json';

export const highlighter = canUseWASM() ? 'highlights' : 'shiki-js';
const syntax: Record<string, string> = {
  comment: p.muted, keyword: p.keyword, 'keyword.operator': p.orange, function: p.blue, 'function.method': p.blue,
  variable: p.foreground, 'variable.member': p.property, property: p.property, string: p.green,
  'string.special': p.cyan, number: p.purple, constant: p.purple, boolean: p.purple,
  type: p.cyan, 'type.builtin': p.cyan, operator: p.orange, punctuation: p.subtle,
  'punctuation.bracket': p.cyan, tag: p.keyword, attribute: p.property, constructor: p.cyan,
  embedded: p.foreground, emphasis: p.yellow, title: p.yellow, link_text: p.blue, link_uri: p.cyan,
};

registerCustomTheme('kiahgawa', async () => ({
  name: 'kiahgawa', appearance: 'dark',
  style: { 'editor.background': p.background, 'editor.foreground': p.foreground,
    syntax: Object.fromEntries(Object.entries(syntax).map(([scope, color]) => [scope, { color, ...(scope === 'comment' ? { font_style: 'italic' } : {}) }])) },
}), 'zed');

// Same palette for environments where WASM/SIMD is unavailable.
registerCustomTheme('kiahgawa', async () => ({
  name: 'kiahgawa', type: 'dark', colors: { 'editor.background': p.background, 'editor.foreground': p.foreground },
  tokenColors: [
    { scope: ['comment'], settings: { foreground: p.muted, fontStyle: 'italic' } },
    { scope: ['keyword', 'storage'], settings: { foreground: p.keyword } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: p.blue } },
    { scope: ['variable', 'meta.definition.variable'], settings: { foreground: p.foreground } },
    { scope: ['variable.other.property', 'entity.other.attribute-name'], settings: { foreground: p.property } },
    { scope: ['string'], settings: { foreground: p.green } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: p.purple } },
    { scope: ['entity.name.type', 'support.type', 'support.class'], settings: { foreground: p.cyan } },
    { scope: ['keyword.operator'], settings: { foreground: p.orange } },
    { scope: ['punctuation'], settings: { foreground: p.subtle } },
  ],
}));

export function installPalette() {
  for (const [name, value] of Object.entries(p)) if (name !== 'name') document.documentElement.style.setProperty(`--${name}`, value);
}
