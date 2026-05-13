export const FALLBACK_DEFAULT_TAB_TEMPLATE = `default_tab_template {
    children
}`;

type KdlNode = {
  name: string;
  start: number;
  end: number;
  text: string;
};

export function kdlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
}

function unescapeKdlStringContents(value: string): string {
  return value.replace(/\\(["\\nrt])/g, (_match, escaped: string) => {
    switch (escaped) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return escaped;
    }
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseKdlConfigStringValue(config: string, key: string): string | null {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s+"((?:\\\\.|[^"\\\\])*)"`);

  for (const line of config.split(/\r?\n/)) {
    if (line.trimStart().startsWith("//")) {
      continue;
    }

    const match = line.match(pattern);
    if (match) {
      return unescapeKdlStringContents(match[1]);
    }
  }

  return null;
}

function isIdentifierCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_-]/.test(character);
}

function findMatchingBrace(text: string, openBraceIndex: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let inLineComment = false;

  for (let index = openBraceIndex; index < text.length; index++) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (inLineComment) {
      if (character === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      inLineComment = true;
      index++;
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth++;
      continue;
    }

    if (character === "}") {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function skipWhitespaceAndComments(text: string, startIndex: number): number {
  let index = startIndex;

  while (index < text.length) {
    if (/\s/.test(text[index])) {
      index++;
      continue;
    }

    if (text[index] === "/" && text[index + 1] === "/") {
      index += 2;
      while (index < text.length && text[index] !== "\n") {
        index++;
      }
      continue;
    }

    break;
  }

  return index;
}

function findNodeEnd(text: string, startIndex: number): number {
  let inString = false;
  let escaped = false;
  let inLineComment = false;

  for (let index = startIndex; index < text.length; index++) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (inLineComment) {
      if (character === "\n") {
        return index;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === "/" && nextCharacter === "/") {
      inLineComment = true;
      index++;
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      const closeBraceIndex = findMatchingBrace(text, index);
      return closeBraceIndex === -1 ? text.length : closeBraceIndex + 1;
    }

    if (character === "\n" || character === "\r" || character === ";") {
      return index;
    }
  }

  return text.length;
}

function topLevelNodes(body: string): KdlNode[] {
  const nodes: KdlNode[] = [];
  let index = 0;

  while (index < body.length) {
    index = skipWhitespaceAndComments(body, index);

    if (!isIdentifierCharacter(body[index])) {
      index++;
      continue;
    }

    const start = index;
    while (isIdentifierCharacter(body[index])) {
      index++;
    }

    const name = body.slice(start, index);
    const end = findNodeEnd(body, start);
    nodes.push({ name, start, end, text: body.slice(start, end) });
    index = end;
  }

  return nodes;
}

function dedent(text: string): string {
  const lines = text.replace(/^\s*\n/, "").replace(/\n\s*$/, "").split(/\r?\n/);
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0);
  const smallestIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(Math.min(smallestIndent, line.length))).join("\n");
}

export function indentKdl(text: string, spaces: number): string {
  const indent = " ".repeat(spaces);
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() === "" ? line : `${indent}${line}`))
    .join("\n");
}

function extractLayoutBody(layout: string): string | null {
  const layoutIndex = layout.search(/\blayout\b/);
  if (layoutIndex === -1) {
    return null;
  }

  const openBraceIndex = layout.indexOf("{", layoutIndex);
  if (openBraceIndex === -1) {
    return null;
  }

  const closeBraceIndex = findMatchingBrace(layout, openBraceIndex);
  if (closeBraceIndex === -1) {
    return null;
  }

  return layout.slice(openBraceIndex + 1, closeBraceIndex);
}

function topLevelBlock(body: string, nodeName: string): string | null {
  const node = topLevelNodes(body).find((candidate) => candidate.name === nodeName && candidate.text.includes("{"));
  return node ? dedent(node.text).trim() : null;
}

function replaceFirstBarePaneWithChildren(templateBody: string): string | null {
  const barePanePattern = /^([ \t]*)pane(?:[ \t]*(?:\/\/.*)?)?$/m;
  if (!barePanePattern.test(templateBody)) {
    return null;
  }

  return templateBody.replace(barePanePattern, "$1children");
}

function replaceFirstPaneWithChildren(templateBody: string): string {
  const nodes = topLevelNodes(templateBody).filter((node) => node.name === "pane");
  const node = nodes.find((candidate) => !/\b(command|plugin)\b/.test(candidate.text)) ?? nodes[0];

  if (!node) {
    return "children";
  }

  const indentation = node.text.match(/^[ \t]*/)?.[0] ?? "";
  return `${templateBody.slice(0, node.start)}${indentation}children${templateBody.slice(node.end)}`;
}

export function defaultTabTemplateFromLayout(layout: string): string {
  const body = extractLayoutBody(layout);
  if (!body) {
    return FALLBACK_DEFAULT_TAB_TEMPLATE;
  }

  const defaultTabTemplate = topLevelBlock(body, "default_tab_template");
  if (defaultTabTemplate) {
    return defaultTabTemplate;
  }

  const newTabTemplate = topLevelBlock(body, "new_tab_template");
  if (newTabTemplate) {
    return newTabTemplate.replace(/^new_tab_template\b/, "default_tab_template");
  }

  const nodes = topLevelNodes(body);
  if (nodes.some((node) => node.name === "tab")) {
    return FALLBACK_DEFAULT_TAB_TEMPLATE;
  }

  const panes = nodes.filter((node) => node.name === "pane");
  if (panes.length === 0) {
    return FALLBACK_DEFAULT_TAB_TEMPLATE;
  }

  const templateBody = body.slice(panes[0].start, panes[panes.length - 1].end);
  const withChildren = replaceFirstBarePaneWithChildren(templateBody) ?? replaceFirstPaneWithChildren(templateBody);

  return `default_tab_template {\n${indentKdl(dedent(withChildren).trim(), 4)}\n}`;
}
