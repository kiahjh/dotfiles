import { rm } from 'node:fs/promises';
import { basename } from 'node:path';

export default async function cleanup() {
  const home = process.env.USER_REVIEW_HOME;
  if (home && /^user-review-browser-\d+$/.test(basename(home))) await rm(home, { recursive: true, force: true });
}
