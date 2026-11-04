import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}

/** Path-safe directory/branch name. Fork titles like `parent/child` get a short hash suffix. */
export function taskDirectoryNameForTitle(title: string): string {
  if (!title.includes("/")) {
    return title;
  }

  const stem =
    title
      .replace(/[^A-Za-z0-9._-]+/g, "--")
      .replace(/--+/g, "--")
      .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
      .slice(0, 54)
      .replace(/[^A-Za-z0-9]+$/g, "") || "task";

  return `${stem}-${shortHash(title)}`;
}

/** Gitignored per-task notes. Creates only what's missing; never overwrites. */
export function ensureTaskScratch(directory: string): void {
  const scratch = join(directory, "scratch");
  mkdirSync(scratch, { recursive: true });
  for (const name of ["prompt.md", "todo.md"]) {
    try {
      writeFileSync(join(scratch, name), "", { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}
