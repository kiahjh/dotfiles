import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { run } from "../process.ts";
import {
  defaultTabTemplateFromLayout,
  FALLBACK_DEFAULT_TAB_TEMPLATE,
  indentKdl,
  kdlString,
  parseKdlConfigStringValue,
} from "./kdl.ts";

function expandHomePath(path: string): string {
  if (path === "~") {
    return homedir();
  }

  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }

  return path;
}

function resolveConfigPath(path: string, configDir: string): string {
  const expandedPath = expandHomePath(path);
  return isAbsolute(expandedPath) ? expandedPath : resolve(configDir, expandedPath);
}

function loadZellijLayout(layoutName: string, configDir: string, layoutDir: string): string {
  const expandedLayoutName = expandHomePath(layoutName);
  const candidatePaths = isAbsolute(expandedLayoutName) || expandedLayoutName.includes("/")
    ? [resolveConfigPath(expandedLayoutName, configDir)]
    : [join(layoutDir, `${expandedLayoutName}.kdl`)];

  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return readFileSync(candidatePath, "utf8");
    }
  }

  const dumpedLayout = run("zellij", ["setup", "--dump-layout", layoutName], { allowFailure: true });
  if (dumpedLayout.status === 0 && dumpedLayout.stdout.trim() !== "") {
    return dumpedLayout.stdout;
  }

  return "layout {\n    pane\n}\n";
}

function loadZellijDefaultTabTemplate(): string {
  const configDir = resolveConfigPath(process.env.ZELLIJ_CONFIG_DIR ?? "~/.config/zellij", homedir());
  const configFile = process.env.ZELLIJ_CONFIG_FILE
    ? resolveConfigPath(process.env.ZELLIJ_CONFIG_FILE, configDir)
    : join(configDir, "config.kdl");
  const config = existsSync(configFile) ? readFileSync(configFile, "utf8") : "";
  const defaultLayout = parseKdlConfigStringValue(config, "default_layout") ?? "default";
  const layoutDirConfig = parseKdlConfigStringValue(config, "layout_dir");
  const layoutDir = layoutDirConfig ? resolveConfigPath(layoutDirConfig, configDir) : join(configDir, "layouts");

  return defaultTabTemplateFromLayout(loadZellijLayout(defaultLayout, configDir, layoutDir));
}

export function zellijLayout(
  tabName: string,
  cwd: string,
  defaultTabTemplate = FALLBACK_DEFAULT_TAB_TEMPLATE,
): string {
  return `layout {
${indentKdl(defaultTabTemplate.trim(), 4)}

    tab name=${kdlString(tabName)} cwd=${kdlString(cwd)} {
        pane split_direction="vertical" {
            pane name="codex" command="codex" focus=true
            pane name="nvim" command="nvim"
        }
    }
}
`;
}

export function writeTempLayout(slug: string, worktreeDir: string): { layoutFile: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "gt-zellij-layout-"));
  const layoutFile = join(dir, "layout.kdl");
  writeFileSync(layoutFile, zellijLayoutForCurrentConfig(slug, worktreeDir));
  return {
    layoutFile,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function zellijLayoutForCurrentConfig(slug: string, worktreeDir: string): string {
  return zellijLayout(slug, worktreeDir, loadZellijDefaultTabTemplate());
}

export function writeCachedLayout(layoutName: string, slug: string, worktreeDir: string): string {
  const dir = join(tmpdir(), "gt-zellij-layouts");
  mkdirSync(dir, { recursive: true });

  const safeName =
    layoutName
      .replace(/[^A-Za-z0-9._-]+/g, "__")
      .replace(/__+/g, "__")
      .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "") || "layout";
  const layoutFile = join(dir, `${safeName}.kdl`);
  writeFileSync(layoutFile, zellijLayoutForCurrentConfig(slug, worktreeDir));
  return layoutFile;
}
