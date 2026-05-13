export class GtError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
  }
}

export function fail(message: string, exitCode = 1): never {
  throw new GtError(message, exitCode);
}
