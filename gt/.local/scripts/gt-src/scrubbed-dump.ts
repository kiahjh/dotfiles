import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  GT_SECRETS_PATH,
  SCRUBBED_DUMP_BUCKET,
  SCRUBBED_DUMP_ENDPOINT,
  SCRUBBED_DUMP_KEY,
  SCRUBBED_DUMP_REGION,
  SCRUBBED_DUMP_SERVICE,
} from "./constants.ts";
import { parseSimpleDotenv } from "./dotenv.ts";
import { fail } from "./errors.ts";
import { run } from "./process.ts";

export type ScrubbedDumpCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

export function loadGtSecrets(): Record<string, string> {
  if (!existsSync(GT_SECRETS_PATH)) {
    return {};
  }

  return parseSimpleDotenv(readFileSync(GT_SECRETS_PATH, "utf8"));
}

export function scrubbedDumpCredentials(): ScrubbedDumpCredentials {
  const secrets = loadGtSecrets();
  const accessKeyId = secrets.GT_SCRUBBED_DUMPS_ACCESS_KEY_ID || process.env.GT_SCRUBBED_DUMPS_ACCESS_KEY_ID || "";
  const secretAccessKey =
    secrets.GT_SCRUBBED_DUMPS_SECRET_ACCESS_KEY || process.env.GT_SCRUBBED_DUMPS_SECRET_ACCESS_KEY || "";

  if (!accessKeyId || !secretAccessKey) {
    fail(
      `missing scrubbed dump credentials; set GT_SCRUBBED_DUMPS_ACCESS_KEY_ID and GT_SCRUBBED_DUMPS_SECRET_ACCESS_KEY in ${GT_SECRETS_PATH}`,
    );
  }

  return { accessKeyId, secretAccessKey };
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function dateStamp(date: Date): string {
  return amzDate(date).slice(0, 8);
}

function signingKey(secretAccessKey: string, date: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export function scrubbedDumpUrl(): URL {
  return new URL(`${SCRUBBED_DUMP_ENDPOINT}/${SCRUBBED_DUMP_BUCKET}/${SCRUBBED_DUMP_KEY}`);
}

export function signedScrubbedDumpHeaders(credentials: ScrubbedDumpCredentials, now = new Date()): Headers {
  const url = scrubbedDumpUrl();
  const host = url.host;
  const amz = amzDate(now);
  const date = dateStamp(now);
  const payloadHash = sha256Hex("");
  const canonicalUri = url.pathname
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amz}\n`;
  const canonicalRequest = ["GET", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${date}/${SCRUBBED_DUMP_REGION}/${SCRUBBED_DUMP_SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amz, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(credentials.secretAccessKey, date, SCRUBBED_DUMP_REGION, SCRUBBED_DUMP_SERVICE),
  )
    .update(stringToSign)
    .digest("hex");

  return new Headers({
    authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
  });
}

export async function downloadScrubbedDump(destination: string): Promise<void> {
  if (process.env.GT_SCRUBBED_DUMP_PATH) {
    run("cp", [process.env.GT_SCRUBBED_DUMP_PATH, destination]);
    return;
  }

  const response = await fetch(scrubbedDumpUrl(), {
    headers: signedScrubbedDumpHeaders(scrubbedDumpCredentials()),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    fail(`scrubbed dump download failed: HTTP ${response.status}${detail ? ` ${detail.slice(0, 160)}` : ""}`);
  }

  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}
