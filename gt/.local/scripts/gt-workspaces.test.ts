import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseCli } from "./gt-src/cli.ts";
import { copyableTaskFile } from "./gt-src/workspace-copy.ts";
import { taskDatabaseNames } from "./gt-src/databases.ts";
import { renderTaskPorts, taskPortsForSlot } from "./gt-src/ports.ts";
import type { Workspace } from "./gt-src/workspace-state.ts";

const entrypoint = join(import.meta.dir, "gt");

function git(directory: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", directory, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function fixture(check: (f: {
  root: string;
  source: string;
  tasks: () => Workspace[];
  invoke: (args: string[], cwd?: string, extra?: Record<string, string>, input?: string) => ReturnType<typeof spawnSync>;
}) => void): void {
  const temporaryRoot = existsSync(join(tmpdir(), "opencode")) ? join(tmpdir(), "opencode") : tmpdir();
  const root = realpathSync(mkdtempSync(join(temporaryRoot, "gt-workspaces-test-")));
  try {
    const bin = join(root, "bin");
    const source = join(root, "origin");
    mkdirSync(bin);
    mkdirSync(join(root, "db"));
    mkdirSync(join(source, "swift", "api"), { recursive: true });
    mkdirSync(join(source, "web"));
    writeFileSync(join(source, "web", "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    writeFileSync(join(source, "web", "package.json"), "{}\n");
    writeFileSync(join(source, "swift", "api", "Package.swift"), "// fixture\n");
    writeFileSync(join(source, "source.txt"), "base\n");
    writeFileSync(join(source, ".gitignore"), ".gtask-ports\n.env\n.env.*\nnode_modules/\n.build/\n");
    git(source, "init", "-b", "master");
    git(source, "config", "user.email", "test@example.invalid");
    git(source, "config", "user.name", "Fixture");
    git(source, "add", ".");
    git(source, "commit", "-m", "fixture");
    const template = join(root, "env-template");
    writeFileSync(template, "DATABASE_USERNAME=changeme\nDATABASE_PASSWORD=changeme\nDATABASE_NAME=changeme\nTEST_DATABASE_NAME=changeme\nACCOUNT_DASHBOARD_URL=changeme\n");
    const dump = join(root, "fixture.sql.gz");
    writeFileSync(dump, gzipSync("SELECT 'scrubbed snapshot';\n"));
    const stub = (name: string, body: string) => writeFileSync(join(bin, name), `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
    const shared = `import {readFileSync,writeFileSync,existsSync,rmSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.env.TEST_ROOT;const args=process.argv.slice(2);
const log=join(root,'calls');writeFileSync(log,JSON.stringify({cmd:process.argv[1].split('/').at(-1),args,pgHost:process.env.PGHOST,pgService:process.env.PGSERVICE})+'\\n',{flag:'a'});
const git=(dir,args)=>{const r=spawnSync('/usr/bin/git',['-C',dir,...args],{encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stdout.trim()};`;
    stub("opencode", shared + `
const [api,method,path]=args;const body=args.includes('--data')?JSON.parse(args[args.indexOf('--data')+1]):{};
const repo=join(root,'repository');
if(path==='/api/session/active')console.log(JSON.stringify({data:process.env.ACTIVE_DIRECTORY?{ses_fixture:{type:'running'}}:{}}));
else if(path==='/api/session/ses_fixture')console.log(JSON.stringify({data:process.env.BAD_ACTIVE_SESSION==='1'?{}:{location:{directory:process.env.ACTIVE_DIRECTORY}}}));
else if(path==='/api/location')console.log(JSON.stringify({project:{id:'fixture-project',canonical:repo}}));
else if(path==='/api/project')console.log(JSON.stringify([{id:'fixture-project'}]));
else if(method==='post'&&path==='/api/worktree'){
 const destination=join(body.directory,body.name);git(body.from,['worktree','add','--detach',destination,body.branch]);console.log(JSON.stringify({directory:destination}));
}else if(method==='delete'&&path==='/api/worktree'){
 if(process.env.FAIL_REMOVE==='1')process.exit(1);
 git(repo,['worktree','remove','--force',body.directory]);
}else if(path!=='/api/worktree/refresh')throw Error('Unexpected API '+args.join(' '));`);
    stub("rex", shared + `
const path=join(root,'rex.json');const sessions=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):[];
if(args[0]==='ls')console.log(JSON.stringify({sessions}));
else if(args[0]==='new'){const session={session_id:'session:'+crypto.randomUUID(),label:args[1]};sessions.push(session);writeFileSync(path,JSON.stringify(sessions));console.log(JSON.stringify(session));}
else if(args[0]==='kill')writeFileSync(path,JSON.stringify(sessions.filter(s=>s.session_id!==args[1])));
else if(args[0]==='-C'&&args[2]==='actions')console.log(JSON.stringify([{name:'session.select'}]));
else if(args[0]==='-C'&&args[2]==='do'&&args[3]==='session.select'){}
else throw Error('unexpected rex command');`);
    stub("pnpm", shared + `if(process.env.FAIL_INSTALL==='1')process.exit(1);`);
    stub("gh", shared + `console.log(JSON.stringify(process.env.MERGED_HEAD?[{state:'MERGED',headRefOid:process.env.MERGED_HEAD}]:[]));`);
    stub("nc", "process.exit(1);");
    for (const command of ["psql", "createdb", "dropdb", "pg_dump", "pg_restore"]) {
      stub(command, shared + `
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGSERVICE||process.env.PGHOSTADDR)throw Error('unsafe inherited PG environment');
const command=${JSON.stringify(command)};const db=name=>join(root,'db',name);
if(args.includes('--version')){console.log(command+' (PostgreSQL) 17.9');process.exit(0);}
if(command==='psql'){
 if(args.includes('--command')){const query=args[args.indexOf('--command')+1];console.log(query==='SHOW server_version_num'?'170009':[...query.matchAll(/'([^']+)'/g)].map(m=>m[1]).filter(n=>existsSync(db(n))).join('\\n'));}
 else {const text=await Bun.stdin.text();writeFileSync(db(args.at(-1)),text);}
}else if(command==='createdb'){
 const name=args.at(-1);if(existsSync(db(name)))throw Error('database already exists');
 if(args.includes('--template'))copyFileSync(db(args[args.indexOf('--template')+1]),db(name));else writeFileSync(db(name),'');
}else if(command==='dropdb'){
 if(process.env.FAIL_DROP==='1')process.exit(1);rmSync(db(args.at(-1)),{force:true});
}else if(command==='pg_dump'){
 if(process.env.FAIL_DUMP==='1')process.exit(1);copyFileSync(db(args.at(-1)),args[args.indexOf('--file')+1]);
}else if(command==='pg_restore')copyFileSync(args.at(-1),db(args[args.indexOf('--dbname')+1]));`);
    }
    const env = {
      ...process.env, PATH: `${bin}:/usr/bin:/bin`, TEST_ROOT: root, USER: "fixture",
      GT_TASKS_DIR: join(root, "tasks"), GT_STATE_DIR: join(root, "state"), GT_REPOSITORY_DIR: join(root, "repository"),
      GT_REPO_URL: source, GT_OPENCODE_BIN: join(bin, "opencode"), GT_ENV_TEMPLATE: template,
      GT_SECRETS_FILE: join(root, "missing-secrets"), GT_SCRUBBED_DUMP_PATH: dump,
      HELVE_HOME: join(root, "helve"), SUPPORT_DIR: join(root, "support"),
      PGHOST: "remote.example.invalid", PGHOSTADDR: "192.0.2.1", PGSERVICE: "must-not-be-used", PGOPTIONS: "must-not-be-used", REX_SESSION: "",
    };
    check({
      root, source,
      tasks: () => existsSync(join(root, "state", "tasks")) ? readdirSync(join(root, "state", "tasks")).filter((name) => name.endsWith(".json"))
        .map((name) => JSON.parse(readFileSync(join(root, "state", "tasks", name), "utf8"))) : [],
      invoke: (args, cwd = root, extra = {}, input) => spawnSync(process.execPath, [entrypoint, ...args], { cwd, env: { ...env, ...extra }, input, encoding: "utf8", timeout: 30_000 }),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function succeeded(result: ReturnType<typeof spawnSync>): void {
  expect(result.stderr?.toString() || "").not.toContain("gt:");
  expect(result.status).toBe(0);
}

test("new CLI aliases and explicit discard are accepted without changing legacy parsing", () => {
  expect(parseCli(["new", "demo", "--no-open"])).toEqual({ command: "spawn", name: "demo", agent: true });
  expect(parseCli(["pr", "42"])).toEqual({ command: "review", pullRequestNumber: 42, agent: false });
  expect(parseCli(["finish", "demo", "--discard"])).toEqual({ command: "kill", taskArg: "demo", discard: true });
  expect(parseCli(["support"])).toEqual({ command: "support" });
  expect(() => parseCli(["finish", "--whatever"])).toThrow("usage");
});

test("fork excludes local credentials, dependencies, and build output", () => {
  for (const path of [".env", "swift/api/.env", ".env.production", ".gtask-ports", "web/node_modules/pkg/a", "swift/.build/a", "secret.pem", "credentials.json", "../escape"]) {
    expect(copyableTaskFile(path)).toBe(false);
  }
  for (const path of ["source.ts", "web/src/new file.ts", ".env.template", "scratch/notes.md"]) expect(copyableTaskFile(path)).toBe(true);
});

test("new provisions a real linked checkout, and open/setup preserve both databases", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "demo", "--no-open"]));
    const task = f.tasks()[0];
    expect(task.phase).toBe("ready");
    expect(task.branch).toBe("gt/demo");
    expect(git(task.directory, "rev-parse", "--git-common-dir")).toContain("repository/.git");
    expect(existsSync(join(task.directory, "swift", "api", ".env"))).toBe(true);
    const names = taskDatabaseNames(task.slug);
    writeFileSync(join(f.root, "db", names.databaseName), "local development changes");
    writeFileSync(join(f.root, "db", names.testDatabaseName), "local test changes");
    succeeded(f.invoke(["open", "demo"]));
    succeeded(f.invoke(["open", "demo"]));
    succeeded(f.invoke(["setup", "demo"]));
    expect(JSON.parse(readFileSync(join(f.root, "rex.json"), "utf8"))).toHaveLength(1);
    expect(readFileSync(join(f.root, "db", names.databaseName), "utf8")).toBe("local development changes");
    expect(readFileSync(join(f.root, "db", names.testDatabaseName), "utf8")).toBe("local test changes");
    succeeded(f.invoke(["refresh-db", "demo"]));
    expect(readFileSync(join(f.root, "db", names.databaseName), "utf8")).toContain("scrubbed snapshot");
  });
});

test("fork preserves staged, unstaged, deleted and untracked source, copies both DBs, and leaves parent untouched", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "parent", "--no-open"]));
    const parent = f.tasks()[0];
    writeFileSync(join(parent.directory, "source.txt"), "staged\n");
    git(parent.directory, "add", "source.txt");
    writeFileSync(join(parent.directory, "source.txt"), "unstaged\n");
    writeFileSync(join(parent.directory, "new source.txt"), "new file\n");
    writeFileSync(join(parent.directory, ".env"), "secret\n");
    rmSync(join(parent.directory, "web", "pnpm-lock.yaml"));
    const originalStatus = git(parent.directory, "status", "--porcelain");
    const parentNames = taskDatabaseNames(parent.slug);
    writeFileSync(join(f.root, "db", parentNames.databaseName), "parent development state");
    writeFileSync(join(f.root, "db", parentNames.testDatabaseName), "parent test state");
    succeeded(f.invoke(["fork", "spike", "--no-open"], parent.directory));
    const child = f.tasks().find((task) => task.parentID === parent.id)!;
    expect(git(child.directory, "show", ":source.txt")).toBe("staged");
    expect(readFileSync(join(child.directory, "source.txt"), "utf8")).toBe("unstaged\n");
    expect(readFileSync(join(child.directory, "new source.txt"), "utf8")).toBe("new file\n");
    expect(existsSync(join(child.directory, ".env"))).toBe(false);
    expect(existsSync(join(child.directory, "web", "pnpm-lock.yaml"))).toBe(false);
    expect(child.ports!.apiPort).not.toBe(parent.ports!.apiPort);
    const childNames = taskDatabaseNames(child.slug);
    expect(readFileSync(join(f.root, "db", childNames.databaseName), "utf8")).toBe("parent development state");
    expect(readFileSync(join(f.root, "db", childNames.testDatabaseName), "utf8")).toBe("parent test state");
    expect(git(parent.directory, "status", "--porcelain")).toBe(originalStatus);
    expect(readFileSync(join(f.root, "db", parentNames.databaseName), "utf8")).toBe("parent development state");
  });
});

test("setup failure retains ownership and can resume without resetting initialized databases", () => {
  fixture((f) => {
    expect(f.invoke(["new", "retry", "--no-open"], undefined, { FAIL_INSTALL: "1" }).status).toBe(1);
    const task = f.tasks()[0];
    expect(task.phase).toBe("setup");
    expect(task.databasesReady).toBe(true);
    const names = taskDatabaseNames(task.slug);
    writeFileSync(join(f.root, "db", names.databaseName), "keep me");
    succeeded(f.invoke(["setup", "retry"]));
    expect(f.tasks()[0].phase).toBe("ready");
    expect(readFileSync(join(f.root, "db", names.databaseName), "utf8")).toBe("keep me");
  });
});

test("finish refuses dirty or unmerged work; discard removes only that task and its recorded session/resources", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "demo"]));
    const task = f.tasks()[0];
    writeFileSync(join(task.directory, "untracked.txt"), "keep unless discarded");
    expect(f.invoke(["finish", "demo"]).status).toBe(1);
    expect(existsSync(task.directory)).toBe(true);
    rmSync(join(task.directory, "untracked.txt"));
    writeFileSync(join(task.directory, "source.txt"), "unmerged commit\n");
    git(task.directory, "-c", "user.name=Fixture", "-c", "user.email=test@example.invalid", "commit", "-am", "unmerged");
    expect(f.invoke(["finish", "demo"]).status).toBe(1);
    succeeded(f.invoke(["finish", "--discard", "demo"]));
    expect(existsSync(task.directory)).toBe(false);
    expect(f.tasks()).toHaveLength(0);
    expect(JSON.parse(readFileSync(join(f.root, "rex.json"), "utf8"))).toHaveLength(0);
    expect(existsSync(join(f.root, "db", taskDatabaseNames(task.slug).databaseName))).toBe(false);
  });
});

test("cleanup failure retains the checkout and resource record for retry", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "demo", "--no-open"]));
    const task = f.tasks()[0];
    expect(f.invoke(["finish", "demo"], undefined, { FAIL_DROP: "1" }).status).toBe(1);
    expect(existsSync(task.directory)).toBe(true);
    expect(f.tasks()).toHaveLength(1);
    expect(f.tasks()[0].phase).toBe("finishing");
    writeFileSync(join(task.directory, "new-work.txt"), "must still protect new work");
    expect(f.invoke(["finish", "demo"]).status).toBe(1);
    rmSync(join(task.directory, "new-work.txt"));
    succeeded(f.invoke(["finish", "demo"]));
    expect(f.tasks()).toHaveLength(0);
  });
});

test("support is permanent, idempotent, and never provisions or refreshes databases", () => {
  fixture((f) => {
    mkdirSync(join(f.root, "support", ".git"), { recursive: true });
    writeFileSync(join(f.root, "support", "AGENTS.md"), "fixture");
    succeeded(f.invoke(["support"]));
    succeeded(f.invoke(["support"]));
    expect(JSON.parse(readFileSync(join(f.root, "rex.json"), "utf8"))).toHaveLength(1);
    const calls = readFileSync(join(f.root, "calls"), "utf8");
    expect(calls).not.toContain('"cmd":"psql"');
    expect(calls).not.toContain('"cmd":"createdb"');
    expect(f.tasks()).toHaveLength(0);
    expect(f.invoke(["finish", "support", "--discard"]).status).toBe(1);
  });
});

test("PR worktrees start at the fetched PR head, not master", () => {
  fixture((f) => {
    git(f.source, "switch", "-c", "feature");
    writeFileSync(join(f.source, "source.txt"), "PR changes\n");
    git(f.source, "commit", "-am", "pull request");
    const head = git(f.source, "rev-parse", "HEAD");
    git(f.source, "update-ref", "refs/pull/42/head", head);
    git(f.source, "switch", "master");
    succeeded(f.invoke(["pr", "42", "--no-open"]));
    const task = f.tasks()[0];
    expect(task.pullRequest).toBe(42);
    expect(git(task.directory, "rev-parse", "HEAD")).toBe(head);
    expect(readFileSync(join(task.directory, "source.txt"), "utf8")).toBe("PR changes\n");
  });
});

test("Helve adoption preserves resources, and a fork leaves Helve Git storage behind", () => {
  fixture((f) => {
    const id = "d7c1e450-8828-471a-bb01-b9f0064cc505";
    const project = "b8be9228-872d-418b-b224-ec74eb0c1987";
    const common = join(f.root, "helve", "repositories", project);
    mkdirSync(join(f.root, "helve", "repositories"), { recursive: true });
    git(f.root, "clone", f.source, common);
    const directory = join(f.root, "helve", "worktrees", project, "existing");
    git(common, "worktree", "add", "-b", "helve/existing", directory, "master");
    const markerDir = join(f.root, "helve", "task-scripts", id);
    mkdirSync(markerDir, { recursive: true });
    const marker = join(markerDir, "gertrude.json");
    writeFileSync(marker, JSON.stringify({ taskID: id, projectID: project, worktree: directory }));
    const names = taskDatabaseNames(`helve_${id.replaceAll("-", "")}`);
    writeFileSync(join(f.root, "db", names.databaseName), "Helve development data");
    writeFileSync(join(f.root, "db", names.testDatabaseName), "Helve test data");
    const env = `DATABASE_NAME=${names.databaseName}\nTEST_DATABASE_NAME=${names.testDatabaseName}\nDATABASE_USERNAME=fixture\n`;
    writeFileSync(join(directory, "swift", "api", ".env"), env);
    const ports = renderTaskPorts("existing", taskPortsForSlot(250));
    writeFileSync(join(directory, ".gtask-ports"), ports);
    writeFileSync(join(directory, "source.txt"), "uncommitted Helve work\n");
    const status = git(directory, "status", "--porcelain");
    succeeded(f.invoke(["adopt", directory, "--no-open"]));
    succeeded(f.invoke(["adopt", directory, "--no-open"]));
    expect(f.tasks()).toHaveLength(1);
    expect(f.tasks()[0].origin).toBe("helve");
    expect(readFileSync(join(directory, "swift", "api", ".env"), "utf8")).toBe(env);
    expect(readFileSync(join(directory, ".gtask-ports"), "utf8")).toBe(ports);
    expect(git(directory, "status", "--porcelain")).toBe(status);
    expect(readFileSync(join(f.root, "db", names.databaseName), "utf8")).toBe("Helve development data");
    const adoptionCalls = readFileSync(join(f.root, "calls"), "utf8");
    expect(adoptionCalls).not.toContain('"cmd":"createdb"');
    expect(adoptionCalls).not.toContain('"cmd":"pnpm"');
    succeeded(f.invoke(["fork", "independent", "--no-open"], directory));
    const child = f.tasks().find((task) => task.parentID === id)!;
    expect(child.gitCommonDir).toBe(join(f.root, "repository", ".git"));
    expect(readFileSync(join(child.directory, "source.txt"), "utf8")).toBe("uncommitted Helve work\n");
    expect(readFileSync(join(f.root, "db", taskDatabaseNames(child.slug).databaseName), "utf8")).toBe("Helve development data");
    expect(existsSync(marker)).toBe(true);
  });
});

test("database dump failure never changes parent databases and leaves a recoverable child", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "parent", "--no-open"]));
    const parent = f.tasks()[0];
    const names = taskDatabaseNames(parent.slug);
    writeFileSync(join(f.root, "db", names.databaseName), "preserve parent");
    expect(f.invoke(["fork", "failed", "--no-open"], parent.directory, { FAIL_DUMP: "1" }).status).toBe(1);
    expect(readFileSync(join(f.root, "db", names.databaseName), "utf8")).toBe("preserve parent");
    const child = f.tasks().find((task) => task.parentID === parent.id)!;
    expect(child.phase).toBe("setup");
    expect(child.databasesReady).toBe(false);
    expect(existsSync(join(f.root, "db", taskDatabaseNames(child.slug).databaseName))).toBe(false);
    succeeded(f.invoke(["setup", child.name]));
    expect(f.tasks().find((task) => task.id === child.id)!.databasesReady).toBe(true);
  });
});

test("tampered resource records fail closed before database cleanup", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "demo", "--no-open"]));
    const task = f.tasks()[0];
    const path = join(f.root, "state", "tasks", `${task.id}.json`);
    task.slug = "support";
    writeFileSync(path, JSON.stringify(task));
    writeFileSync(join(f.root, "calls"), "");
    expect(f.invoke(["finish", "demo", "--discard"]).status).toBe(1);
    expect(readFileSync(join(f.root, "calls"), "utf8")).toBe("");
    expect(existsSync(task.directory)).toBe(true);
  });
});

test("discard cannot delete a task with a still-running OpenCode agent", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "demo", "--no-open"]));
    const task = f.tasks()[0];
    const result = f.invoke(["finish", "demo", "--discard"], undefined, { ACTIVE_DIRECTORY: task.directory });
    expect(result.status).toBe(1);
    expect(result.stderr?.toString()).toContain("agent is still working");
    expect(existsSync(task.directory)).toBe(true);
    expect(f.tasks()[0].phase).toBe("ready");
    expect(existsSync(join(f.root, "db", taskDatabaseNames(task.slug).databaseName))).toBe(true);
  });
});

test("finish reads the current OpenCode session envelope and permits unrelated active agents", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "demo", "--no-open"]));
    const task = f.tasks()[0];
    succeeded(f.invoke(["finish", "demo", "--discard"], undefined, { ACTIVE_DIRECTORY: task.directory + "-unrelated" }));
    expect(existsSync(task.directory)).toBe(false);
    expect(f.tasks()).toHaveLength(0);
  });
});

test("finish fails closed when an active agent's directory cannot be verified", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "demo", "--no-open"]));
    const task = f.tasks()[0];
    for (const extra of [
      { ACTIVE_DIRECTORY: task.directory, BAD_ACTIVE_SESSION: "1" },
      { ACTIVE_DIRECTORY: "relative-directory" },
    ]) {
      const result = f.invoke(["finish", "demo", "--discard"], undefined, extra);
      expect(result.status).toBe(1);
      expect(result.stderr?.toString()).toContain("could not verify an active OpenCode agent's directory");
      expect(existsSync(task.directory)).toBe(true);
      expect(f.tasks()[0].phase).toBe("ready");
      expect(existsSync(join(f.root, "db", taskDatabaseNames(task.slug).databaseName))).toBe(true);
    }
  });
});

test("squash/rebase merged PR verification requires the exact local head", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "squashed", "--no-open"]));
    const task = f.tasks()[0];
    writeFileSync(join(task.directory, "source.txt"), "squash merged change\n");
    git(task.directory, "-c", "user.name=Fixture", "-c", "user.email=test@example.invalid", "commit", "-am", "change");
    expect(f.invoke(["finish", "squashed"], undefined, { MERGED_HEAD: "different-commit" }).status).toBe(1);
    expect(existsSync(task.directory)).toBe(true);
    succeeded(f.invoke(["finish", "squashed"], undefined, { MERGED_HEAD: git(task.directory, "rev-parse", "HEAD") }));
    expect(existsSync(task.directory)).toBe(false);
    expect(f.tasks()).toHaveLength(0);
  });
});

test("discard still refuses redirected worktrees and main checkouts", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "demo", "--no-open"]));
    const task = f.tasks()[0];
    const moved = task.directory + "-moved";
    renameSync(task.directory, moved);
    symlinkSync(moved, task.directory);
    expect(f.invoke(["finish", "demo", "--discard"]).status).toBe(1);
    expect(existsSync(join(f.root, "db", taskDatabaseNames(task.slug).databaseName))).toBe(true);
    const path = join(f.root, "state", "tasks", `${task.id}.json`);
    task.directory = join(f.root, "repository");
    task.gitCommonDir = join(task.directory, ".git");
    writeFileSync(path, JSON.stringify(task));
    const result = f.invoke(["finish", "demo", "--discard"]);
    expect(result.status).toBe(1);
    expect(result.stderr?.toString()).toContain("main checkout");
    expect(existsSync(task.directory)).toBe(true);
  });
});

test("Rex new action accepts a typed task name and selects the ready session", () => {
  fixture((f) => {
    const context = JSON.stringify({ clientID: "client:fixture", args: {} });
    succeeded(f.invoke(["rex-action", "new", context], undefined, {}, "from-palette\n"));
    expect(f.tasks()).toHaveLength(1);
    const task = f.tasks()[0];
    expect(task.name).toBe("from-palette");
    expect(task.phase).toBe("ready");
    expect(task.rexSession).not.toBeNull();
    const calls = readFileSync(join(f.root, "calls"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(calls.some((call) => call.cmd === "rex" && call.args.includes("session.select") && call.args.includes(`session_id=${task.rexSession}`))).toBe(true);
  });
});

test("Rex support action runs without terminal input and reuses only the permanent support session", () => {
  fixture((f) => {
    mkdirSync(join(f.root, "support", ".git"), { recursive: true });
    writeFileSync(join(f.root, "support", "AGENTS.md"), "fixture");
    const context = JSON.stringify({ sourceSession: "session:source", clientID: "client:fixture", args: {} });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = f.invoke(["rex-action", "support", context], undefined, {}, "");
      succeeded(result);
      expect(result.stdout?.toString()).not.toContain("Task number or name");
      expect(result.stdout?.toString()).not.toContain("Press Return");
    }
    const sessions = JSON.parse(readFileSync(join(f.root, "rex.json"), "utf8"));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].label).toBe("support");
    const calls = readFileSync(join(f.root, "calls"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(calls.every((call) => call.cmd === "rex")).toBe(true);
    expect(calls.filter((call) => call.args[0] === "new")).toHaveLength(1);
    expect(calls.filter((call) => call.args.includes("session.select") && call.args.includes(`session_id=${sessions[0].session_id}`))).toHaveLength(2);
    expect(f.tasks()).toHaveLength(0);
    const missing = f.invoke(["rex-action", "support", context], undefined, { SUPPORT_DIR: join(f.root, "missing-support") }, "");
    expect(missing.status).toBe(1);
    expect(missing.stderr?.toString()).toContain("support repository not found");
  });
});

test("Rex fork uses the captured source session, never the worker cwd", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "parent"]));
    const parent = f.tasks()[0];
    const context = JSON.stringify({ sourceSession: parent.rexSession, args: {} });
    succeeded(f.invoke(["rex-action", "fork", context], f.root, { REX_SESSION: "session:temporary-job" }, "child\n"));
    expect(f.tasks().some((task) => task.name === "parent/child" && task.parentID === parent.id)).toBe(true);
  });
});

test("Rex finish confirms the captured task and can safely close its source session", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "demo"]));
    const task = f.tasks()[0];
    const context = JSON.stringify({ sourceSession: task.rexSession, args: {} });
    succeeded(f.invoke(["rex-action", "finish", context], f.root, { REX_SESSION: "session:temporary-job" }, "finish demo\n"));
    expect(existsSync(task.directory)).toBe(false);
    expect(f.tasks()).toHaveLength(0);
    expect(JSON.parse(readFileSync(join(f.root, "rex.json"), "utf8"))).toHaveLength(0);
  });
});

test("Rex destructive actions cancel on wrong confirmation or EOF, including discard", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "demo"]));
    const task = f.tasks()[0];
    writeFileSync(join(task.directory, "valuable.txt"), "uncommitted work\n");
    const context = JSON.stringify({ sourceSession: task.rexSession, args: {} });
    for (const operation of ["finish", "discard", "refresh-db"]) {
      succeeded(f.invoke(["rex-action", operation, context], undefined, {}, "yes\n"));
      succeeded(f.invoke(["rex-action", operation, context], undefined, {}, ""));
      expect(existsSync(task.directory)).toBe(true);
      expect(readFileSync(join(task.directory, "valuable.txt"), "utf8")).toBe("uncommitted work\n");
      expect(existsSync(join(f.root, "db", taskDatabaseNames(task.slug).databaseName))).toBe(true);
    }
    succeeded(f.invoke(["rex-action", "discard", context], undefined, {}, "discard demo\n"));
    expect(existsSync(task.directory)).toBe(false);
  });
});

test("Rex reopen always offers a choice, including repeated opens from a registered task", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "current"]));
    succeeded(f.invoke(["new", "other", "--no-open"]));
    const current = f.tasks().find((task) => task.name === "current")!;
    const context = JSON.stringify({ sourceSession: current.rexSession, args: {} });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = f.invoke(["rex-action", "open", context], f.root, {}, "2\n");
      succeeded(result);
      expect(result.stdout?.toString()).toContain("Choose a development task");
      expect(result.stdout?.toString()).toContain("Task: other");
    }
    const cancelled = f.invoke(["rex-action", "open", context], f.root, {}, "\n");
    succeeded(cancelled);
    expect(cancelled.stdout?.toString()).toContain("Cancelled");
    const explicit = f.invoke(["rex-action", "open", JSON.stringify({ sourceSession: current.rexSession, args: { task: "other" } })]);
    succeeded(explicit);
    expect(explicit.stdout?.toString()).not.toContain("Choose a development task");
    expect(JSON.parse(readFileSync(join(f.root, "rex.json"), "utf8"))).toHaveLength(2);
  });
});

test("Rex action without task context offers an explicit choice and never guesses from cwd", () => {
  fixture((f) => {
    succeeded(f.invoke(["new", "demo"]));
    const task = f.tasks()[0];
    const context = JSON.stringify({ sourceSession: "session:unrelated", args: {} });
    const cancelled = f.invoke(["rex-action", "finish", context], task.directory, {}, "\n");
    succeeded(cancelled);
    expect(cancelled.stdout?.toString()).toContain("Choose a development task");
    expect(existsSync(task.directory)).toBe(true);
    succeeded(f.invoke(["rex-action", "finish", context], f.root, {}, "1\nfinish demo\n"));
    expect(existsSync(task.directory)).toBe(false);
  });
});
