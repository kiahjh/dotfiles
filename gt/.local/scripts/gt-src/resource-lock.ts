import { dlopen, FFIType } from "bun:ffi";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";
import { fail } from "./errors.ts";

let library: ReturnType<typeof dlopen> | undefined;

function acquireLock(path: string): number {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    fail("Gertrude resource locks require macOS or Linux");
  }
  library ??= dlopen(process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6", {
    flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  });
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const fd = openSync(path, "a", 0o600);
  const deadline = Date.now() + 60_000;
  const wait = new Int32Array(new SharedArrayBuffer(4));
  while (library.symbols.flock(fd, 6) !== 0) {
    if (Date.now() >= deadline) {
      closeSync(fd);
      fail(`another Gertrude setup or cleanup is still using ${path}; retry when it finishes`);
    }
    Atomics.wait(wait, 0, 0, 50);
  }
  return fd;
}

export function withResourceLockSync<T>(path: string, operation: () => T): T {
  const fd = acquireLock(path);
  try {
    return operation();
  } finally {
    closeSync(fd);
  }
}

export async function withResourceLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const fd = acquireLock(path);
  try {
    return await operation();
  } finally {
    closeSync(fd);
  }
}
