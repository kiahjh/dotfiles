import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { browserQuery, openOffer, type Runner } from "./launch";
import { displayLabel, openLabel, resolveTarget, type Offer } from "./model";
import { createQueue } from "./queue";
import { targetSummary } from "./presentation";

let directory: string;
beforeAll(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), "opencode-opener-test-")));
  await Promise.all(["report.html", "photo.png", "paper.pdf", "notes.md", "data.json", "tool.py", "letter.rtf", "install.sh", "run.command", "archive.dmg", "execute.txt", "space ' quote; $(touch nope).html", "space ' quote; $(touch nope).md"].map((name) => writeFile(join(directory, name), "test", { mode: 0o644 })));
  await chmod(join(directory, "execute.txt"), 0o755);
  await mkdir(join(directory, "folder"));
  await mkdir(join(directory, "Unsafe.app"));
  await symlink(join(directory, "run.command"), join(directory, "disguised.html"));
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

function offer(overrides: Partial<Offer> = {}): Offer {
  return { id: "call1", sessionID: "ses_test", label: "Test link", target: "https://example.com/", kind: "url", destination: "browser", hostname: "test-mac", ...overrides };
}
async function file(name: string): Promise<Offer> {
  return offer(await resolveTarget(join(directory, name), directory));
}
function runner() {
  const calls: { file: string; args: string[] }[] = [];
  const run: Runner = async (file, args) => { calls.push({ file, args }); return file === "/usr/bin/osascript" ? "/Applications/My Browser.app" : ""; };
  // An empty environment keeps tests independent of whether they run inside Rex.
  return { calls, run, platform: "darwin", hostname: "test-mac", env: {} as NodeJS.ProcessEnv };
}
const rexEnv = { REX_SESSION: "session:test", REX_BLOCK: "block:opencode", REX_BIN_DIR: "/Applications/Rex Server.app/Contents/MacOS" };

describe("target validation", () => {
  test("card metadata shows a filename instead of a noisy absolute path", () => {
    expect(targetSummary(offer({ kind: "file", target: "/private/var/folders/long/path/report.html" }))).toBe("HTML · report.html");
    expect(targetSummary(offer({ kind: "directory", target: "/Users/example/Documents" }))).toBe("Folder · Documents");
  });
  test("card metadata keeps URL hosts and ports visible", () => {
    expect(targetSummary(offer({ target: "https://example.com:8443/report" }))).toBe("Web link · example.com:8443/report");
  });
  test("long filenames retain their extension", () => {
    const summary = targetSummary(offer({ kind: "file", target: `/files/${"report".repeat(30)}.html` }));
    expect(summary).toContain("…");
    expect(summary.endsWith(".html")).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(71);
  });
  test("HTTP(S) links are normalized", async () => {
    expect(await resolveTarget("HTTPS://example.com/a?q=hello world", directory)).toMatchObject({ kind: "url", target: "https://example.com/a?q=hello%20world", destination: "browser" });
  });
  test.each(["javascript:alert(1)", "data:text/html,hi", "ftp://example.com", "mailto:hi@example.com", "https://user:password@example.com", "https://example.com\n", "\u001b[31m", ""])("rejects unsafe target %s", async (target) => {
    await expect(resolveTarget(target, directory)).rejects.toThrow();
  });
  test.each([["report.html", "browser"], ["photo.png", "preview"], ["paper.pdf", "preview"], ["notes.md", "editor"], ["data.json", "editor"], ["tool.py", "editor"], ["letter.rtf", "default"], ["folder", "default"]])("routes %s to %s", async (name, destination) => {
    expect(await resolveTarget(name, directory)).toMatchObject({ target: join(directory, name), destination });
  });
  test("supports local file URLs and spaces without treating them as commands", async () => {
    const path = join(directory, "space ' quote; $(touch nope).html");
    expect((await resolveTarget(pathToFileURL(path).href, directory)).target).toBe(path);
  });
  test.each(["run.command", "install.sh", "archive.dmg", "execute.txt", "Unsafe.app", "disguised.html", "missing.pdf"])("rejects unsafe or missing file %s", async (name) => {
    await expect(resolveTarget(name, directory)).rejects.toThrow();
  });
  test("rejects non-local file URLs", async () => {
    await expect(resolveTarget("file://other-machine/path/report.html", directory)).rejects.toThrow();
  });
  test("sanitizes labels for a terminal", () => {
    expect(displayLabel(" hi\u001b\nthere\u202e ")).toBe("hi  there");
    expect(displayLabel("x".repeat(200))).toHaveLength(120);
  });
});

describe("local launch (no real applications are launched)", () => {
  test("a link launches only when openOffer is explicitly called", async () => {
    const local = runner();
    await resolveTarget("https://example.com", directory);
    expect(local.calls).toEqual([]);
    await openOffer(offer(), local);
    expect(local.calls).toEqual([{ file: "/usr/bin/open", args: ["--", "https://example.com/"] }]);
  });
  test("HTML uses the default browser, not its file association", async () => {
    const local = runner();
    const item = await file("space ' quote; $(touch nope).html");
    await openOffer(item, local);
    expect(local.calls).toEqual([
      { file: "/usr/bin/osascript", args: ["-l", "JavaScript", "-e", browserQuery] },
      { file: "/usr/bin/open", args: ["-a", "/Applications/My Browser.app", "--", item.target] },
    ]);
    expect(browserQuery).not.toContain(item.target);
  });
  test("PDF uses Preview", async () => {
    const local = runner();
    const item = await file("paper.pdf");
    await openOffer(item, local);
    expect(local.calls).toEqual([{ file: "/usr/bin/open", args: ["-a", "Preview", "--", item.target] }]);
  });
  test("folders and rich text use their default app", async () => {
    for (const name of ["folder", "letter.rtf"]) {
      const local = runner();
      const item = await file(name);
      await openOffer(item, local);
      expect(local.calls).toEqual([{ file: "/usr/bin/open", args: ["--", item.target] }]);
    }
  });
  test("in Rex, text opens in Neovim in a new pane beside OpenCode", async () => {
    const local = runner();
    const item = await file("space ' quote; $(touch nope).md");
    await openOffer(item, { ...local, env: rexEnv });
    expect(local.calls).toEqual([{
      file: "/Applications/Rex Server.app/Contents/MacOS/rex",
      args: ["split", "-s", "session:test", "-b", "block:opencode", "--split=right", "-c", directory,
        "--label", "space ' quote; $(touch nope).md", "--", "nvim", "--", item.target],
    }]);
  });
  test("in Rex without a known binary folder, rex is found on PATH", async () => {
    const local = runner();
    await openOffer(await file("tool.py"), { ...local, env: { REX_SESSION: "s", REX_BLOCK: "b", REX_BIN_DIR: "relative/dir" } });
    expect(local.calls[0]!.file).toBe("rex");
  });
  test("outside Rex, text uses the default text editor, not the file's association", async () => {
    for (const name of ["notes.md", "tool.py"]) {
      const local = runner();
      const item = await file(name);
      await openOffer(item, local);
      expect(local.calls).toEqual([{ file: "/usr/bin/open", args: ["-t", "--", item.target] }]);
    }
  });
  test("the button names the app that will open text", async () => {
    const item = await file("notes.md");
    expect(openLabel(item, rexEnv)).toBe("Open in Neovim");
    expect(openLabel(item, {})).toBe("Open in text editor");
  });
  test("refuses files from a remote machine", async () => {
    const local = runner();
    await expect(openOffer({ ...await file("report.html"), hostname: "another-mac" }, local)).rejects.toThrow("another machine");
    expect(local.calls).toEqual([]);
  });
  test("refuses remote localhost URLs but allows public URLs", async () => {
    const local = runner();
    for (const target of ["http://localhost:3000/", "http://127.0.0.1:3000/", "http://[::1]:3000/"]) {
      await expect(openOffer(offer({ target, hostname: "remote" }), local)).rejects.toThrow("localhost");
    }
    await openOffer(offer({ hostname: "remote" }), local);
    expect(local.calls).toHaveLength(1);
  });
  test("revalidates a file on click", async () => {
    const path = join(directory, "changed.html");
    await writeFile(path, "test", { mode: 0o644 });
    const item = await file("changed.html");
    await chmod(path, 0o755);
    const local = runner();
    await expect(openOffer(item, local)).rejects.toThrow("non-executable");
    expect(local.calls).toEqual([]);
  });
  test("does not trust stored routing", async () => {
    const local = runner();
    await expect(openOffer({ ...await file("paper.pdf"), destination: "browser" }, local)).rejects.toThrow("changed");
    expect(local.calls).toEqual([]);
  });
  test("reports launcher failure", async () => {
    await expect(openOffer(offer(), { ...runner(), run: async () => { throw new Error("Launch failed"); } })).rejects.toThrow("Launch failed");
  });
  test("does not guess a browser if the lookup fails", async () => {
    const calls: string[] = [];
    await expect(openOffer(await file("report.html"), { ...runner(), run: async (file) => { calls.push(file); return ""; } })).rejects.toThrow("default browser");
    expect(calls).toEqual(["/usr/bin/osascript"]);
  });
  test("other operating systems fail without launching", async () => {
    const local = runner();
    await expect(openOffer(offer(), { ...local, platform: "linux" })).rejects.toThrow("macOS");
    expect(local.calls).toEqual([]);
  });
});

describe("durable session queues", () => {
  function storage() {
    const values = new Map<string, unknown>();
    return { values, async get(key: string) { return structuredClone(values.get(key)); }, async set(key: string, value: Offer[]) { values.set(key, structuredClone(value)); } };
  }
  test("concurrent offers are serialized without losing items", async () => {
    const store = storage();
    const queue = createQueue(store);
    await Promise.all(Array.from({ length: 10 }, (_, index) => queue.add(offer({ id: `call${index}`, target: `https://example.com/${index}` }))));
    expect(await queue.list("ses_test")).toHaveLength(10);
    expect(await createQueue(store).list("ses_test")).toHaveLength(10);
  });
  test("targets and retried tool calls are deduplicated", async () => {
    const queue = createQueue(storage());
    await queue.add(offer());
    await queue.add(offer({ id: "another-call" }));
    expect(await queue.list("ses_test")).toHaveLength(1);
  });
  test("sessions are isolated and dismissal is idempotent", async () => {
    const queue = createQueue(storage());
    await queue.add(offer());
    await queue.add(offer({ sessionID: "ses_other" }));
    await queue.dismiss("ses_other", "call1");
    await queue.dismiss("ses_other", "call1");
    expect(await queue.list("ses_other")).toEqual([]);
    expect(await queue.list("ses_test")).toHaveLength(1);
  });
  test("offer/dismiss races do not restore dismissed items", async () => {
    const queue = createQueue(storage());
    await Promise.all([queue.add(offer()), queue.dismiss("ses_test", "call1"), queue.add(offer({ id: "call2", target: "https://example.com/2" }))]);
    expect((await queue.list("ses_test")).map((item) => item.id)).toEqual(["call2"]);
  });
  test("a full queue refuses new offers without dropping old ones", async () => {
    const queue = createQueue(storage());
    for (let index = 0; index < 20; index++) await queue.add(offer({ id: `call${index}`, target: `https://example.com/${index}` }));
    await expect(queue.add(offer({ id: "overflow" }))).rejects.toThrow("20 pending");
    expect(await queue.list("ses_test")).toHaveLength(20);
  });
  test("failed storage writes do not poison subsequent operations", async () => {
    const store = storage();
    let fail = true;
    const queue = createQueue({ get: store.get, set: async (key, value) => { if (fail) throw new Error("Storage unavailable"); await store.set(key, value); } });
    await expect(queue.add(offer())).rejects.toThrow("Storage unavailable");
    fail = false;
    await queue.add(offer());
    expect(await queue.list("ses_test")).toHaveLength(1);
  });
});
