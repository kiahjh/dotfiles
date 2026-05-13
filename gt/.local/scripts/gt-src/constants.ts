import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const REPO_URL = "https://github.com/gertrude-app/gertrude.git";
export const BASE_DIR = join(homedir(), "active-projects", "gertrude");
export const MASTER_BRANCH = "master";
export const CONFIRMATION = "yes, I'm sure";

export const GT_PACKAGE_DIR = resolve(import.meta.dir, "..", "..", "..");
export const ENV_TEMPLATE_PATH = process.env.GT_ENV_TEMPLATE || join(GT_PACKAGE_DIR, ".env.template");
export const GT_SECRETS_PATH = process.env.GT_SECRETS_FILE || join(GT_PACKAGE_DIR, ".env");

export const SCRUBBED_DUMP_BUCKET = "gertrude-scrubbed-dumps";
export const SCRUBBED_DUMP_KEY = "latest.sql.gz";
export const SCRUBBED_DUMP_ENDPOINT = "https://nyc3.digitaloceanspaces.com";
export const SCRUBBED_DUMP_REGION = "us-east-1";
export const SCRUBBED_DUMP_SERVICE = "s3";

export const TASK_PORT_BASE = 18_000;
export const TASK_PORT_BLOCK_SIZE = 10;
export const TASK_PORT_SLOT_COUNT = 4_000;
