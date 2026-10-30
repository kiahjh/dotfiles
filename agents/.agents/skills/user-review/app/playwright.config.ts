import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Always isolate tests from the user's actual notes, even if they have set
// USER_REVIEW_HOME in their shell.
process.env.USER_REVIEW_BROWSER_ROOT ??= join(tmpdir(), `user-review-browser-${process.pid}`);
process.env.USER_REVIEW_HOME = process.env.USER_REVIEW_BROWSER_ROOT;
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1, timeout: 30000,
  globalTeardown: './tests/cleanup.ts',
  use: { baseURL: 'http://127.0.0.1:4732', viewport: { width: 1550, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'], trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHROME ? { channel: 'chrome' } : {}) },
  webServer: { command: 'node bin/user-review.mjs serve --port 4732', url: 'http://127.0.0.1:4732/api/health', reuseExistingServer: false, timeout: 20000 },
});
