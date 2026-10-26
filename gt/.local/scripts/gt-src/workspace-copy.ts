import { copyFileSync, lstatSync, mkdirSync, readlinkSync, symlinkSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fail } from "./errors.ts";
import { run } from "./process.ts";

export function copyableTaskFile(path: string): boolean {
  if (isAbsolute(path) || path.split("/").some((part) => part === ".." || part === ".git")) return false;
  if (/(^|\/)(node_modules|\.build|\.swiftpm|DerivedData|dist|coverage|\.next|\.turbo|\.cache|\.ssh|\.aws|\.gnupg)(\/|$)/.test(path)) return false;
  const file = path.split("/").at(-1)!;
  if (/^(\.gtask(?:-ports)?|\.npmrc|\.netrc|\.DS_Store)$/.test(file)) return false;
  if (/^\.env(?:\.|$)/.test(file) && !/^\.env\.(example|sample|template)$/.test(file)) return false;
  return !/(\.(pem|key|p12|pfx|mobileprovision)|credentials(?:\.json)?|secrets?(?:\.json)?)$/i.test(file);
}

function names(source: string, args: string[]): string[] {
  return run("git", ["-C", source, ...args, "-z"]).stdout.split("\0").filter(Boolean).filter(copyableTaskFile);
}

export function copyUncommittedWork(source: string, destination: string): void {
  for (const staged of [true, false]) {
    const flags = staged ? ["--cached"] : [];
    const paths = names(source, ["diff", ...flags, "--name-only", "--no-renames"]);
    if (paths.length === 0) continue;
    const patch = run("git", ["-C", source, "diff", ...flags, "--binary", "--full-index", "--no-ext-diff", "--no-textconv", "--no-renames", "--", ...paths]).stdout;
    if (patch) run("git", ["-C", destination, "apply", ...staged ? ["--index"] : [], "--binary", "-"], { input: patch });
  }
  for (const path of names(source, ["ls-files", "--others", "--exclude-standard"])) {
    const from = join(source, path);
    const to = join(destination, path);
    const stat = lstatSync(from);
    mkdirSync(dirname(to), { recursive: true });
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(from);
      const inside = relative(destination, resolve(dirname(to), target));
      if (isAbsolute(target) || inside === ".." || inside.startsWith("../")) fail(`refusing to copy escaping symlink: ${path}`);
      symlinkSync(target, to);
    } else if (stat.isFile()) {
      copyFileSync(from, to);
    } else {
      fail(`unsupported untracked file: ${path}`);
    }
  }
}
