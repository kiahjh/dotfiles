/**
 * Web Fetch Tool - Fetch web pages without overwhelming model context
 *
 * Responses are streamed to disk, formatted as text/HTML/raw content, and
 * either returned within pi's tool-output limits or saved for selective reads.
 */

import { copyFile, mkdir, mkdtemp, open, rename, rm, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type ExtensionAPI,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";

const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_INLINE_KB = DEFAULT_MAX_BYTES / 1024;
const HTML_SNIFF_LIMIT = 8 * 1024;
const MAX_ENTITY_LENGTH = 32;
const MAX_TAG_LENGTH = 8 * 1024;

const namedEntities: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	"#39": "'",
	apos: "'",
	nbsp: " ",
	ndash: "–",
	mdash: "—",
	laquo: "«",
	raquo: "»",
	copy: "©",
	reg: "®",
	trade: "™",
	hellip: "…",
};

const blockTags = new Set([
	"p",
	"div",
	"section",
	"article",
	"header",
	"footer",
	"nav",
	"main",
	"aside",
	"li",
	"tr",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
]);

/** Collapse whitespace while preserving at most two newlines and trimming edges. */
class WhitespaceNormalizer {
	private hasOutput = false;
	private pendingSpace = false;
	private pendingNewlines = 0;

	push(value: string): string {
		const output: string[] = [];

		for (const token of value.match(/\s+|[^\s]+/gu) ?? []) {
			if (/^\s+$/u.test(token)) {
				let newlines = 0;
				for (const character of token) {
					if (character === "\n") newlines++;
				}

				if (newlines > 0) {
					this.pendingNewlines = Math.min(2, this.pendingNewlines + newlines);
					this.pendingSpace = false;
				} else if (this.pendingNewlines === 0) {
					this.pendingSpace = true;
				}
				continue;
			}

			if (this.hasOutput) {
				if (this.pendingNewlines > 0) {
					output.push("\n".repeat(this.pendingNewlines));
				} else if (this.pendingSpace) {
					output.push(" ");
				}
			}

			output.push(token);
			this.hasOutput = true;
			this.pendingSpace = false;
			this.pendingNewlines = 0;
		}

		return output.join("");
	}

	finish(): string {
		// Intentionally discard trailing whitespace.
		this.pendingSpace = false;
		this.pendingNewlines = 0;
		return "";
	}
}

/** Incremental equivalent of the original lightweight HTML-to-text conversion. */
class HtmlToTextStream {
	private buffer = "";
	private ignoredTag: "script" | "style" | undefined;
	private insideComment = false;
	private readonly whitespace = new WhitespaceNormalizer();

	push(value: string): string {
		this.buffer += value;
		return this.process(false);
	}

	finish(value = ""): string {
		this.buffer += value;
		return this.process(true) + this.whitespace.finish();
	}

	private process(final: boolean): string {
		const source = this.buffer;
		const lowerSource = source.toLowerCase();
		const output: string[] = [];
		let index = 0;

		const emit = (value: string) => {
			const normalized = this.whitespace.push(value);
			if (normalized) output.push(normalized);
		};

		while (index < source.length) {
			if (this.insideComment) {
				const commentEnd = source.indexOf("-->", index);
				if (commentEnd < 0) {
					if (final) {
						index = source.length;
						break;
					}
					this.buffer = source.slice(Math.max(index, source.length - 2));
					return output.join("");
				}
				this.insideComment = false;
				index = commentEnd + 3;
				continue;
			}

			if (this.ignoredTag) {
				const marker = `</${this.ignoredTag}`;
				const closeStart = lowerSource.indexOf(marker, index);
				if (closeStart < 0) {
					if (final) {
						index = source.length;
						break;
					}
					const keepLength = Math.min(marker.length - 1, source.length - index);
					this.buffer = source.slice(source.length - keepLength);
					return output.join("");
				}

				const closeEnd = source.indexOf(">", closeStart + marker.length);
				if (closeEnd < 0) {
					if (final) {
						index = source.length;
						break;
					}
					this.buffer = source.slice(closeStart);
					return output.join("");
				}

				this.ignoredTag = undefined;
				index = closeEnd + 1;
				continue;
			}

			const nextTag = source.indexOf("<", index);
			const nextEntity = source.indexOf("&", index);
			let nextSpecial = source.length;
			if (nextTag >= 0) nextSpecial = Math.min(nextSpecial, nextTag);
			if (nextEntity >= 0) nextSpecial = Math.min(nextSpecial, nextEntity);

			if (nextSpecial > index) {
				emit(source.slice(index, nextSpecial));
				index = nextSpecial;
				continue;
			}

			if (source[index] === "&") {
				const entityEnd = source.indexOf(";", index + 1);
				const candidateLength = entityEnd < 0 ? source.length - index : entityEnd - index + 1;
				if (entityEnd >= 0 && candidateLength <= MAX_ENTITY_LENGTH) {
					emit(decodeEntity(source.slice(index, entityEnd + 1)));
					index = entityEnd + 1;
					continue;
				}
				if (!final && entityEnd < 0 && candidateLength <= MAX_ENTITY_LENGTH) {
					this.buffer = source.slice(index);
					return output.join("");
				}
				emit("&");
				index++;
				continue;
			}

			if (source.startsWith("<!--", index)) {
				this.insideComment = true;
				index += 4;
				continue;
			}

			const tagEnd = source.indexOf(">", index + 1);
			if (tagEnd < 0) {
				if (!final && source.length - index <= MAX_TAG_LENGTH) {
					this.buffer = source.slice(index);
					return output.join("");
				}
				// Treat an excessively long or final unterminated tag as plain text.
				emit("<");
				index++;
				continue;
			}

			const rawTag = source.slice(index + 1, tagEnd).trim();
			const closing = rawTag.startsWith("/");
			const tagBody = closing ? rawTag.slice(1).trimStart() : rawTag;
			const tagName = tagBody.match(/^([a-zA-Z][a-zA-Z0-9:-]*)/)?.[1]?.toLowerCase();
			const selfClosing = /\/\s*$/.test(rawTag);

			if (!closing && !selfClosing && (tagName === "script" || tagName === "style")) {
				this.ignoredTag = tagName;
			} else if (!closing && tagName === "br") {
				emit("\n");
			} else if (!closing && tagName === "hr") {
				emit("\n---\n");
			} else if (closing && tagName && blockTags.has(tagName)) {
				emit("\n");
			}

			index = tagEnd + 1;
		}

		this.buffer = "";
		return output.join("");
	}
}

function decodeEntity(entity: string): string {
	const body = entity.slice(1, -1);
	const named = namedEntities[body.toLowerCase()];
	if (named !== undefined) return named;

	const decimal = body.match(/^#(\d+)$/);
	const hexadecimal = body.match(/^#x([0-9a-f]+)$/i);
	const codePoint = decimal ? Number(decimal[1]) : hexadecimal ? Number.parseInt(hexadecimal[1], 16) : undefined;
	if (
		codePoint !== undefined &&
		Number.isInteger(codePoint) &&
		codePoint >= 0 &&
		codePoint <= 0x10ffff &&
		!(codePoint >= 0xd800 && codePoint <= 0xdfff)
	) {
		return String.fromCodePoint(codePoint);
	}

	return entity;
}

class Utf8FileWriter {
	responseBytes = 0;
	outputBytes = 0;
	private newlineCount = 0;
	private hasOutput = false;
	private endsWithNewline = false;

	constructor(private readonly file: FileHandle) {}

	async write(value: string): Promise<void> {
		if (!value) return;

		const bytes = Buffer.from(value, "utf8");
		let offset = 0;
		while (offset < bytes.length) {
			const { bytesWritten } = await this.file.write(bytes, offset, bytes.length - offset);
			if (bytesWritten === 0) throw new Error("Unable to write fetched content");
			offset += bytesWritten;
		}

		this.outputBytes += bytes.length;
		this.hasOutput = true;
		this.endsWithNewline = value.endsWith("\n");
		for (const character of value) {
			if (character === "\n") this.newlineCount++;
		}
	}

	get outputLines(): number {
		if (!this.hasOutput) return 0;
		return this.newlineCount + (this.endsWithNewline ? 0 : 1);
	}
}

type WebFetchFormat = "text" | "html" | "raw";

interface StreamedResponse {
	url: string;
	status: number;
	statusText: string;
	ok: boolean;
	contentType: string;
	responseBytes: number;
	outputBytes: number;
	outputLines: number;
}

interface InlinePreview {
	content: string;
	truncated: boolean;
	truncatedBy: "lines" | "bytes" | null;
	outputBytes: number;
	outputLines: number;
}

interface WebFetchDetails {
	url: string;
	status: number;
	statusText: string;
	contentType: string;
	/** Exact number of response-body bytes received; retained for renderer compatibility. */
	contentLength: number;
	responseBytes: number;
	outputBytes: number;
	outputLines: number;
	truncated: boolean;
	format: WebFetchFormat;
	savedToFile: boolean;
	outputPath?: string;
}

const WebFetchParams = Type.Object({
	url: Type.String({ description: "URL to fetch" }),
	format: Type.Optional(
		StringEnum(["text", "html", "raw"] as const, {
			description:
				"Output format: 'text' strips HTML to plain text (default), 'html' returns raw HTML, 'raw' returns the response body as-is",
		}),
	),
	headers: Type.Optional(
		Type.Record(Type.String(), Type.String(), {
			description: 'Custom request headers (e.g. { "Authorization": "Bearer ..." })',
		}),
	),
	maxKB: Type.Optional(
		Type.Number({
			description: `Maximum inline output in KB (default and hard maximum: ${MAX_INLINE_KB}). Larger output is saved to a temporary file.`,
			exclusiveMinimum: 0,
			maximum: MAX_INLINE_KB,
		}),
	),
	timeout: Type.Optional(
		Type.Number({
			description: `Request timeout in seconds, including body download (default: ${DEFAULT_TIMEOUT_SECONDS})`,
			exclusiveMinimum: 0,
		}),
	),
	outputPath: Type.Optional(
		Type.String({
			description:
				"Write the complete formatted response to this path and return only metadata. Relative paths are resolved from the working directory; parent directories are created.",
		}),
	),
});

type WebFetchInput = Static<typeof WebFetchParams>;

async function streamResponseToFile(
	response: Response,
	format: WebFetchFormat,
	filePath: string,
): Promise<Pick<StreamedResponse, "responseBytes" | "outputBytes" | "outputLines">> {
	const file = await open(filePath, "w");
	const writer = new Utf8FileWriter(file);
	const decoder = new TextDecoder();
	const contentType = response.headers.get("content-type") ?? "unknown";

	let htmlConverter: HtmlToTextStream | null | undefined;
	let sniffBuffer = "";
	if (format !== "text") {
		htmlConverter = null;
	} else if (contentType.toLowerCase().includes("html")) {
		htmlConverter = new HtmlToTextStream();
	}

	const writeDecoded = async (value: string, final = false): Promise<void> => {
		if (htmlConverter === undefined) {
			sniffBuffer += value;
			const firstNonWhitespace = sniffBuffer.search(/\S/u);
			if (firstNonWhitespace < 0 && !final && Buffer.byteLength(sniffBuffer, "utf8") <= HTML_SNIFF_LIMIT) {
				return;
			}

			const looksLikeHtml = firstNonWhitespace >= 0 && sniffBuffer[firstNonWhitespace] === "<";
			htmlConverter = looksLikeHtml ? new HtmlToTextStream() : null;
			value = sniffBuffer;
			sniffBuffer = "";
		}

		if (htmlConverter) {
			await writer.write(final ? htmlConverter.finish(value) : htmlConverter.push(value));
		} else {
			await writer.write(value);
		}
	};

	try {
		if (response.body) {
			const reader = response.body.getReader();
			let complete = false;
			try {
				while (true) {
					const chunk = await reader.read();
					if (chunk.done) {
						complete = true;
						break;
					}
					writer.responseBytes += chunk.value.byteLength;
					await writeDecoded(decoder.decode(chunk.value, { stream: true }));
				}
			} finally {
				if (!complete) await reader.cancel().catch(() => undefined);
				reader.releaseLock();
			}
		}

		await writeDecoded(decoder.decode(), true);
		return {
			responseBytes: writer.responseBytes,
			outputBytes: writer.outputBytes,
			outputLines: writer.outputLines,
		};
	} finally {
		await file.close();
	}
}

async function fetchToFile(
	url: string,
	format: WebFetchFormat,
	headers: Record<string, string> | undefined,
	timeoutSeconds: number,
	filePath: string,
	signal: AbortSignal | undefined,
): Promise<StreamedResponse> {
	const controller = new AbortController();
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutSeconds * 1000);
	timeout.unref?.();

	const abortFromParent = () => controller.abort();
	if (signal?.aborted) controller.abort();
	else signal?.addEventListener("abort", abortFromParent, { once: true });

	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent": "pi-agent/1.0",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				...headers,
			},
			signal: controller.signal,
			redirect: "follow",
		});
		const streamed = await streamResponseToFile(response, format, filePath);
		if (timedOut || signal?.aborted) throw new Error("Request aborted after the response body completed");
		return {
			url: response.url,
			status: response.status,
			statusText: response.statusText,
			ok: response.ok,
			contentType: response.headers.get("content-type") ?? "unknown",
			...streamed,
		};
	} catch (error: unknown) {
		if (timedOut) throw new Error(`Request timed out after ${timeoutSeconds}s: ${url}`);
		if (signal?.aborted) throw new Error(`Request cancelled: ${url}`);
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Fetch failed: ${message}`);
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", abortFromParent);
	}
}

async function readPrefix(filePath: string, byteCount: number): Promise<Buffer> {
	if (byteCount <= 0) return Buffer.alloc(0);
	const file = await open(filePath, "r");
	const buffer = Buffer.alloc(byteCount);
	let offset = 0;
	try {
		while (offset < byteCount) {
			const { bytesRead } = await file.read(buffer, offset, byteCount - offset, offset);
			if (bytesRead === 0) break;
			offset += bytesRead;
		}
		return buffer.subarray(0, offset);
	} finally {
		await file.close();
	}
}

function nthNewline(buffer: Buffer, count: number): number {
	let found = 0;
	for (let index = 0; index < buffer.length; index++) {
		if (buffer[index] !== 0x0a) continue;
		found++;
		if (found === count) return index;
	}
	return -1;
}

function countLines(content: string): number {
	if (!content) return 0;
	let newlines = 0;
	for (const character of content) {
		if (character === "\n") newlines++;
	}
	return newlines + (content.endsWith("\n") ? 0 : 1);
}

async function createInlinePreview(
	filePath: string,
	outputBytes: number,
	outputLines: number,
	maxBytes: number,
): Promise<InlinePreview> {
	const bytesTruncated = outputBytes > maxBytes;
	const linesTruncated = outputLines > DEFAULT_MAX_LINES;
	if (!bytesTruncated && !linesTruncated) {
		const content = (await readPrefix(filePath, outputBytes)).toString("utf8");
		return {
			content,
			truncated: false,
			truncatedBy: null,
			outputBytes,
			outputLines,
		};
	}

	// One extra byte reveals a newline immediately after a line that exactly fits.
	const prefix = await readPrefix(filePath, Math.min(outputBytes, maxBytes + 1));
	let cutoff = prefix.length;
	let truncatedBy: "lines" | "bytes" = linesTruncated ? "lines" : "bytes";

	if (bytesTruncated) {
		const byteCutoff = prefix.lastIndexOf(0x0a, Math.min(maxBytes, prefix.length - 1));
		const completeByteCutoff = byteCutoff >= 0 ? byteCutoff : 0;
		if (completeByteCutoff < cutoff) {
			cutoff = completeByteCutoff;
			truncatedBy = "bytes";
		}
	}

	if (linesTruncated) {
		const lineCutoff = nthNewline(prefix, DEFAULT_MAX_LINES);
		if (lineCutoff >= 0 && lineCutoff <= cutoff) {
			cutoff = lineCutoff;
			truncatedBy = "lines";
		}
	}

	const content = prefix.subarray(0, cutoff).toString("utf8");
	return {
		content,
		truncated: true,
		truncatedBy,
		outputBytes: Buffer.byteLength(content, "utf8"),
		outputLines: countLines(content),
	};
}

function normalizeOutputPath(outputPath: string, cwd: string): string {
	const withoutAtPrefix = outputPath.startsWith("@") ? outputPath.slice(1) : outputPath;
	if (!withoutAtPrefix.trim()) throw new Error("outputPath must not be empty");
	return resolve(cwd, withoutAtPrefix);
}

function temporaryFileName(format: WebFetchFormat, contentType: string): string {
	if (format === "html") return "output.html";
	if (format === "raw") {
		const normalized = contentType.toLowerCase();
		if (normalized.includes("json")) return "output.json";
		if (normalized.includes("xml")) return "output.xml";
	}
	return "output.txt";
}

function appendNotice(content: string, notice: string): string {
	return content ? `${content}\n\n${notice}` : notice;
}

function httpStatus(response: Pick<StreamedResponse, "status" | "statusText">): string {
	return `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
}

export default function webfetch(pi: ExtensionAPI) {
	pi.registerTool({
		name: "webfetch",
		label: "Web Fetch",
		description: `Fetch a web page or API endpoint. Inline output is limited to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}; larger responses are saved to a temporary file. Set outputPath to save the complete formatted response and return only metadata.`,
		promptSnippet: "Fetch a URL inline or save the response to a file for selective reading",
		promptGuidelines: [
			"Use webfetch to retrieve web page content, API responses, or documentation from URLs.",
			"Default webfetch format 'text' strips HTML tags — use 'raw' for JSON APIs.",
			"Use webfetch outputPath for large or potentially large responses, then inspect the file selectively with read or grep.",
		],
		parameters: WebFetchParams,
		prepareArguments(args) {
			// Keep old persisted calls that used the previous 200KB default resumable.
			if (!args || typeof args !== "object") return args as WebFetchInput;
			const input = args as WebFetchInput;
			if (typeof input.maxKB === "number" && input.maxKB > MAX_INLINE_KB) {
				return { ...input, maxKB: MAX_INLINE_KB };
			}
			return input;
		},

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const url = params.url;
			const format = params.format ?? "text";
			const maxKB = params.maxKB ?? MAX_INLINE_KB;
			const timeoutSeconds = params.timeout ?? DEFAULT_TIMEOUT_SECONDS;

			let parsed: URL;
			try {
				parsed = new URL(url);
			} catch {
				throw new Error(`Invalid URL: ${url}`);
			}
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				throw new Error(`Unsupported protocol: ${parsed.protocol} — only http and https are supported`);
			}
			if (!Number.isFinite(maxKB) || maxKB <= 0 || maxKB > MAX_INLINE_KB) {
				throw new Error(`maxKB must be greater than 0 and no more than ${MAX_INLINE_KB}`);
			}
			if (
				!Number.isFinite(timeoutSeconds) ||
				timeoutSeconds <= 0 ||
				timeoutSeconds * 1000 > 2_147_483_647
			) {
				throw new Error("timeout must be greater than 0 and no more than 2147483 seconds");
			}

			onUpdate?.({ content: [{ type: "text", text: `Fetching ${url}...` }], details: {} });

			const tempDir = await mkdtemp(join(tmpdir(), "pi-webfetch-"));
			let keepTemporaryOutput = false;
			try {
				// The extension is text-oriented, so all formats are decoded and stored as UTF-8.
				const initialTempPath = join(tempDir, "response.tmp");
				const response = await fetchToFile(
					url,
					format,
					params.headers,
					timeoutSeconds,
					initialTempPath,
					signal,
				);
				const tempOutputPath = join(tempDir, temporaryFileName(format, response.contentType));
				await rename(initialTempPath, tempOutputPath);

				const details: WebFetchDetails = {
					url: response.url,
					status: response.status,
					statusText: response.statusText,
					contentType: response.contentType,
					contentLength: response.responseBytes,
					responseBytes: response.responseBytes,
					outputBytes: response.outputBytes,
					outputLines: response.outputLines,
					truncated: false,
					format,
					savedToFile: false,
				};

				if (params.outputPath !== undefined) {
					const outputPath = normalizeOutputPath(params.outputPath, ctx.cwd);
					await withFileMutationQueue(outputPath, async () => {
						await mkdir(dirname(outputPath), { recursive: true });
						await copyFile(tempOutputPath, outputPath);
					});
					details.savedToFile = true;
					details.outputPath = outputPath;

					const result = `${httpStatus(response)}; wrote ${formatSize(response.outputBytes)} (${response.outputLines} lines, ${format}) to ${outputPath}. Use read with offset/limit or grep to inspect it.`;
					return { content: [{ type: "text", text: result }], details };
				}

				const maxBytes = Math.max(1, Math.floor(maxKB * 1024));
				const preview = await createInlinePreview(
					tempOutputPath,
					response.outputBytes,
					response.outputLines,
					maxBytes,
				);
				let result = preview.content;

				if (!response.ok) {
					result = appendNotice(result, `[${httpStatus(response)}]`);
				} else if (!result && response.outputBytes === 0) {
					result = `[Empty response body; ${httpStatus(response)}]`;
				}

				if (preview.truncated) {
					keepTemporaryOutput = true;
					details.truncated = true;
					details.savedToFile = true;
					details.outputPath = tempOutputPath;
					const omittedLines = Math.max(0, response.outputLines - preview.outputLines);
					const omittedBytes = Math.max(0, response.outputBytes - preview.outputBytes);
					const notice = `[Output truncated by ${preview.truncatedBy}: showing ${preview.outputLines} of ${response.outputLines} lines (${formatSize(preview.outputBytes)} of ${formatSize(response.outputBytes)}). ${omittedLines} lines (${formatSize(omittedBytes)}) omitted. Full output saved to: ${tempOutputPath}. Use read with offset/limit or grep to inspect it.]`;
					result = appendNotice(result, notice);
				}

				return { content: [{ type: "text", text: result }], details };
			} finally {
				if (!keepTemporaryOutput) {
					await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
				}
			}
		},

		renderCall(args, theme, _context) {
			const url = (args.url as string) || "";
			const format = (args.format as string) || "text";
			const outputPath = args.outputPath as string | undefined;
			let text = theme.fg("toolTitle", theme.bold("webfetch "));
			text += theme.fg("accent", truncateToWidth(url, 80));
			if (format !== "text") text += theme.fg("muted", ` (${format})`);
			if (outputPath) text += theme.fg("dim", ` → ${truncateToWidth(outputPath, 60)}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as WebFetchDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			const statusColor = details.status >= 200 && details.status < 300 ? "success" : "warning";
			let info = theme.fg(statusColor, `${details.status} `);
			info += theme.fg("muted", formatSize(details.outputBytes));
			if (details.truncated) info += theme.fg("warning", " [inline truncated]");
			info += theme.fg("dim", ` → ${details.url}`);
			if (details.outputPath) {
				info += `\n${theme.fg("dim", `Saved to ${details.outputPath}`)}`;
			}

			if (details.savedToFile && !details.truncated) return new Text(info, 0, 0);

			const content = result.content[0];
			const body = content?.type === "text" ? content.text : "";
			const preview = body
				.split("\n")
				.filter((line: string) => line.trim())
				.slice(0, 8)
				.map((line: string) => theme.fg("text", truncateToWidth(line, 100)))
				.join("\n");
			return new Text(`${info}${preview ? `\n${preview}` : ""}${body.split("\n").length > 8 ? `\n${theme.fg("dim", "...")}` : ""}`, 0, 0);
		},
	});
}
