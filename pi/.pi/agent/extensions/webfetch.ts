/**
 * Web Fetch Tool - Fetch web pages and return their content
 *
 * Fetches URLs and returns content as text. Supports HTML-to-text conversion,
 * raw HTML, and non-HTML content types. Handles redirects, timeouts, and errors.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

/** Strip HTML tags and decode common entities, collapsing whitespace */
function htmlToText(html: string): string {
	// Remove script and style blocks entirely
	let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
	text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

	// Replace block-level elements with newlines
	text = text.replace(/<\/(p|div|section|article|header|footer|nav|main|aside|li|tr|h[1-6])>/gi, "\n");
	text = text.replace(/<br\s*\/?>/gi, "\n");
	text = text.replace(/<hr\s*\/?>/gi, "\n---\n");

	// Strip remaining tags
	text = text.replace(/<[^>]+>/g, "");

	// Decode common HTML entities
	const entities: Record<string, string> = {
		"&amp;": "&",
		"&lt;": "<",
		"&gt;": ">",
		"&quot;": '"',
		"&#39;": "'",
		"&apos;": "'",
		"&nbsp;": " ",
		"&ndash;": "–",
		"&mdash;": "—",
		"&laquo;": "«",
		"&raquo;": "»",
		"&copy;": "©",
		"&reg;": "®",
		"&trade;": "™",
		"&hellip;": "…",
	};
	for (const [entity, char] of Object.entries(entities)) {
		text = text.replaceAll(entity, char);
	}
	// Decode numeric entities
	text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
	text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

	// Collapse whitespace: multiple spaces/tabs to single space, multiple newlines to double
	text = text.replace(/[^\S\n]+/g, " ");
	text = text.replace(/\n\s*\n/g, "\n\n");
	text = text
		.split("\n")
		.map((l) => l.trim())
		.join("\n");
	text = text.replace(/\n{3,}/g, "\n\n");

	return text.trim();
}

/** Truncate content to a maximum character count */
function truncateContent(content: string, maxChars: number): { text: string; truncated: boolean } {
	if (content.length <= maxChars) return { text: content, truncated: false };
	return { text: content.slice(0, maxChars) + "\n\n[...truncated]", truncated: true };
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
			description: "Custom request headers (e.g. { \"Authorization\": \"Bearer ...\" })",
		}),
	),
	maxKB: Type.Optional(
		Type.Number({
			description: "Maximum response size in KB (default: 200). Content beyond this is truncated.",
		}),
	),
	timeout: Type.Optional(
		Type.Number({
			description: "Request timeout in seconds (default: 30)",
		}),
	),
});

interface WebFetchDetails {
	url: string;
	status: number;
	contentType: string;
	contentLength: number;
	truncated: boolean;
	format: string;
}

export default function webfetch(pi: ExtensionAPI) {
	pi.registerTool({
		name: "webfetch",
		label: "Web Fetch",
		description:
			"Fetch a web page or API endpoint and return its content. By default strips HTML to plain text. Use format 'html' for raw HTML or 'raw' for non-HTML responses (JSON, XML, etc).",
		promptSnippet: "Fetch a URL and return its content as text, HTML, or raw",
		promptGuidelines: [
			"Use webfetch to retrieve web page content, API responses, or documentation from URLs.",
			"Default format 'text' strips HTML tags — use 'raw' for JSON APIs.",
		],
		parameters: WebFetchParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const url = params.url;
			const format = params.format ?? "text";
			const maxChars = (params.maxKB ?? 200) * 1024;
			const timeoutMs = (params.timeout ?? 30) * 1000;

			// Validate URL
			let parsed: URL;
			try {
				parsed = new URL(url);
			} catch {
				throw new Error(`Invalid URL: ${url}`);
			}

			if (!["http:", "https:"].includes(parsed.protocol)) {
				throw new Error(`Unsupported protocol: ${parsed.protocol} — only http and https are supported`);
			}

			onUpdate?.({ content: [{ type: "text", text: `Fetching ${url}...` }] });

			// Build request
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), timeoutMs);

			// Link to parent signal
			if (signal) {
				signal.addEventListener("abort", () => controller.abort(), { once: true });
			}

			try {
				const response = await fetch(url, {
					headers: {
						"User-Agent": "pi-agent/1.0",
						Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
						...params.headers,
					},
					signal: controller.signal,
					redirect: "follow",
				});

				clearTimeout(timeout);

				const contentType = response.headers.get("content-type") ?? "unknown";
				const body = await response.text();

				let output: string;
				if (format === "html" || format === "raw") {
					output = body;
				} else {
					// text format: strip HTML if content looks like HTML
					const isHtml = contentType.includes("html") || body.trimStart().startsWith("<");
					output = isHtml ? htmlToText(body) : body;
				}

				const { text, truncated } = truncateContent(output, maxChars);

				const details: WebFetchDetails = {
					url: response.url, // final URL after redirects
					status: response.status,
					contentType,
					contentLength: body.length,
					truncated,
					format,
				};

				const statusNote = response.ok ? "" : ` (HTTP ${response.status} ${response.statusText})`;

				return {
					content: [{ type: "text", text: `${text}${statusNote}` }],
					details,
				};
			} catch (err: unknown) {
				clearTimeout(timeout);
				const message = err instanceof Error ? err.message : String(err);
				if (message.includes("abort")) {
					throw new Error(`Request timed out after ${params.timeout ?? 30}s: ${url}`);
				}
				throw new Error(`Fetch failed: ${message}`);
			}
		},

		renderCall(args, theme, _context) {
			const url = (args.url as string) || "";
			const format = (args.format as string) || "text";
			let text = theme.fg("toolTitle", theme.bold("webfetch "));
			text += theme.fg("accent", truncateToWidth(url, 80));
			if (format !== "text") {
				text += theme.fg("muted", ` (${format})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as WebFetchDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			const statusColor = details.status >= 200 && details.status < 300 ? "success" : "warning";
			const sizeKB = (details.contentLength / 1024).toFixed(1);
			let info = theme.fg(statusColor, `${details.status} `);
			info += theme.fg("muted", `${sizeKB} KB`);
			if (details.truncated) {
				info += theme.fg("warning", " [truncated]");
			}
			info += theme.fg("dim", ` → ${details.url}`);

			// Show a preview of the content (first few lines)
			const content = result.content[0];
			const body = content?.type === "text" ? content.text : "";
			const preview = body
				.split("\n")
				.filter((l: string) => l.trim())
				.slice(0, 8)
				.map((l: string) => theme.fg("text", truncateToWidth(l, 100)))
				.join("\n");

			return new Text(`${info}\n${preview}${body.split("\n").length > 8 ? "\n" + theme.fg("dim", "...") : ""}`, 0, 0);
		},
	});
}
