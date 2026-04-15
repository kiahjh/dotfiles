import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { chromium, webkit, type Browser, type BrowserContext, type Page } from "playwright";

type BrowserName = "chromium" | "webkit";
type WaitState = "visible" | "hidden" | "attached" | "detached";
type VideoFormat = "webm" | "mp4";

const BrowserScreenshotParams = Type.Object({
	url: Type.Optional(Type.String({ description: "URL to open in the browser" })),
	path: Type.Optional(Type.String({ description: "Local HTML file path to open in the browser" })),
	selector: Type.Optional(
		Type.String({
			description: "Optional CSS selector for the element to screenshot. If omitted, screenshots the full page or viewport.",
		}),
	),
	outputPath: Type.Optional(Type.String({ description: "Optional output path for the PNG file." })),
	browser: Type.Optional(
		StringEnum(["chromium", "webkit"] as const, {
			description: "Browser engine to use. Defaults to chromium.",
		}),
	),
	viewportWidth: Type.Optional(Type.Number({ description: "Viewport width in CSS pixels. Defaults to 1440." })),
	viewportHeight: Type.Optional(Type.Number({ description: "Viewport height in CSS pixels. Defaults to 900." })),
	fullPage: Type.Optional(
		Type.Boolean({ description: "When no selector is provided, capture the full page. Defaults to true." }),
	),
	waitForMs: Type.Optional(
		Type.Number({ description: "Optional extra time to wait after load, in milliseconds." }),
	),
	openInPreview: Type.Optional(
		Type.Boolean({ description: "Open the screenshot in Preview on macOS. Defaults to true." }),
	),
});

const BrowserOpenParams = Type.Object({
	url: Type.Optional(Type.String({ description: "URL to open in the browser" })),
	path: Type.Optional(Type.String({ description: "Local HTML file path to open in the browser" })),
	browser: Type.Optional(StringEnum(["chromium", "webkit"] as const, { description: "Browser engine to use." })),
	viewportWidth: Type.Optional(Type.Number({ description: "Viewport width in CSS pixels. Defaults to 1440." })),
	viewportHeight: Type.Optional(Type.Number({ description: "Viewport height in CSS pixels. Defaults to 900." })),
	waitForMs: Type.Optional(Type.Number({ description: "Optional extra time to wait after load, in milliseconds." })),
});

const BrowserClickParams = Type.Object({
	selector: Type.String({ description: "CSS selector to click" }),
	waitForMs: Type.Optional(Type.Number({ description: "Optional extra time to wait after clicking, in milliseconds." })),
});

const BrowserTypeParams = Type.Object({
	selector: Type.String({ description: "CSS selector for the input element" }),
	text: Type.String({ description: "Text to type" }),
	clearFirst: Type.Optional(Type.Boolean({ description: "Clear the field before typing. Defaults to true." })),
	delayMs: Type.Optional(Type.Number({ description: "Delay between typed characters in milliseconds." })),
	pressEnter: Type.Optional(Type.Boolean({ description: "Press Enter after typing." })),
	waitForMs: Type.Optional(Type.Number({ description: "Optional extra time to wait after typing, in milliseconds." })),
});

const BrowserPressParams = Type.Object({
	key: Type.String({ description: "Keyboard key to press, e.g. Enter, Tab, ArrowDown" }),
	selector: Type.Optional(Type.String({ description: "Optional CSS selector to focus before pressing the key" })),
	waitForMs: Type.Optional(Type.Number({ description: "Optional extra time to wait after pressing, in milliseconds." })),
});

const BrowserWaitParams = Type.Object({
	selector: Type.Optional(Type.String({ description: "Optional CSS selector to wait for" })),
	text: Type.Optional(Type.String({ description: "Optional visible text to wait for" })),
	state: Type.Optional(
		StringEnum(["visible", "hidden", "attached", "detached"] as const, {
			description: "State to wait for when using selector or text. Defaults to visible.",
		}),
	),
	waitForMs: Type.Optional(Type.Number({ description: "Optional fixed delay in milliseconds." })),
	timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds. Defaults to 30000." })),
});

const BrowserStartRecordingParams = Type.Object({
	outputPath: Type.Optional(Type.String({ description: "Optional final output path for the recording." })),
	format: Type.Optional(
		StringEnum(["webm", "mp4"] as const, {
			description: "Recording format. Defaults to mp4 if ffmpeg is available, otherwise webm.",
		}),
	),
	browser: Type.Optional(StringEnum(["chromium", "webkit"] as const, { description: "Browser engine to use." })),
	viewportWidth: Type.Optional(Type.Number({ description: "Viewport width in CSS pixels. Defaults to current session or 1440." })),
	viewportHeight: Type.Optional(Type.Number({ description: "Viewport height in CSS pixels. Defaults to current session or 900." })),
	preserveCurrentPage: Type.Optional(
		Type.Boolean({ description: "Reopen the current page after recording starts. Defaults to true." }),
	),
	openAfterSave: Type.Optional(Type.Boolean({ description: "Open the saved recording after stopping. Defaults to true." })),
});

const BrowserStopRecordingParams = Type.Object({});
const BrowserCloseParams = Type.Object({});

interface RecordingState {
	dir: string;
	format: VideoFormat;
	finalPath?: string;
	openAfterSave: boolean;
}

interface SessionState {
	browser?: Browser;
	context?: BrowserContext;
	page?: Page;
	browserName: BrowserName;
	viewportWidth: number;
	viewportHeight: number;
	recording?: RecordingState;
}

const state: SessionState = {
	browserName: "chromium",
	viewportWidth: 1440,
	viewportHeight: 900,
};

let operationChain: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
	const run = operationChain.then(fn, fn);
	operationChain = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

function nowStamp() {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

function defaultScreenshotPath(): string {
	return resolve(tmpdir(), `pi-browser-screenshot-${nowStamp()}.png`);
}

function defaultVideoPath(format: VideoFormat): string {
	return resolve(tmpdir(), `pi-browser-recording-${nowStamp()}.${format}`);
}

function defaultRecordingDir(): string {
	return resolve(tmpdir(), `pi-browser-recording-${nowStamp()}`);
}

async function ensureParentDir(path: string) {
	await mkdir(dirname(path), { recursive: true });
}

function resolveMaybePath(cwd: string, path?: string, extension?: string): string | undefined {
	if (!path) return undefined;
	const resolved = resolve(cwd, path);
	if (extension && !extname(resolved)) {
		return `${resolved}.${extension}`;
	}
	return resolved;
}

function resolveSource(cwd: string, params: { url?: string; path?: string }): { source: string; displaySource: string } {
	if (params.url && params.path) {
		throw new Error("Provide either 'url' or 'path', not both.");
	}
	if (params.url) {
		return { source: params.url, displaySource: params.url };
	}
	if (params.path) {
		const absolutePath = resolve(cwd, params.path);
		return { source: pathToFileURL(absolutePath).href, displaySource: absolutePath };
	}
	throw new Error("Provide either 'url' or 'path'.");
}

function currentUrl(): string | undefined {
	const url = state.page?.url();
	if (!url || url === "about:blank") return undefined;
	return url;
}

function currentBrowserType(name: BrowserName) {
	return name === "webkit" ? webkit : chromium;
}

async function waitExtra(page: Page, waitForMs?: number) {
	if (waitForMs && waitForMs > 0) {
		await page.waitForTimeout(waitForMs);
	}
}

async function closeSession() {
	await state.context?.close().catch(() => undefined);
	await state.browser?.close().catch(() => undefined);
	state.browser = undefined;
	state.context = undefined;
	state.page = undefined;
	state.recording = undefined;
}

async function recreateSession(options: {
	browserName: BrowserName;
	viewportWidth: number;
	viewportHeight: number;
	recording?: RecordingState;
	preserveUrl?: string;
}) {
	await closeSession();

	const browser = await currentBrowserType(options.browserName).launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: options.viewportWidth, height: options.viewportHeight },
		...(options.recording
			? {
					recordVideo: {
						dir: options.recording.dir,
						size: { width: options.viewportWidth, height: options.viewportHeight },
					},
				}
			: {}),
	});
	const page = await context.newPage();

	state.browser = browser;
	state.context = context;
	state.page = page;
	state.browserName = options.browserName;
	state.viewportWidth = options.viewportWidth;
	state.viewportHeight = options.viewportHeight;
	state.recording = options.recording;

	if (options.preserveUrl) {
		await page.goto(options.preserveUrl, { waitUntil: "networkidle" });
	}

	return page;
}

async function ensureSession(options?: {
	browserName?: BrowserName;
	viewportWidth?: number;
	viewportHeight?: number;
}) {
	const browserName = options?.browserName ?? state.browserName;
	const viewportWidth = Math.max(1, Math.floor(options?.viewportWidth ?? state.viewportWidth ?? 1440));
	const viewportHeight = Math.max(1, Math.floor(options?.viewportHeight ?? state.viewportHeight ?? 900));

	if (!state.page) {
		return recreateSession({ browserName, viewportWidth, viewportHeight });
	}

	if (
		state.browserName !== browserName ||
		state.viewportWidth !== viewportWidth ||
		state.viewportHeight !== viewportHeight
	) {
		return recreateSession({
			browserName,
			viewportWidth,
			viewportHeight,
			preserveUrl: currentUrl(),
			recording: state.recording,
		});
	}

	return state.page;
}

async function ensureActivePage() {
	if (!state.page || !currentUrl()) {
		throw new Error("No active page. Use browser_open first, or pass url/path to browser_screenshot.");
	}
	return state.page;
}

async function findRecordedVideo(dir: string): Promise<string> {
	const entries = await readdir(dir, { withFileTypes: true });
	const file = entries.find((entry) => entry.isFile() && entry.name.endsWith(".webm"));
	if (!file) {
		throw new Error("No recording file was produced.");
	}
	return resolve(dir, file.name);
}

async function openPath(pi: ExtensionAPI, path: string) {
	if (process.platform === "darwin") {
		await pi.exec("open", [path]);
	}
}

async function convertVideoIfNeeded(pi: ExtensionAPI, inputPath: string, outputPath: string, format: VideoFormat) {
	await ensureParentDir(outputPath);
	if (format === "webm") {
		await rename(inputPath, outputPath);
		return outputPath;
	}

	const result = await pi.exec("ffmpeg", ["-y", "-i", inputPath, "-movflags", "+faststart", outputPath]);
	if (result.code !== 0) {
		const message = result.stderr.trim() || result.stdout.trim() || "Unknown ffmpeg error";
		throw new Error(`ffmpeg failed while converting recording: ${message}`);
	}
	return outputPath;
}

export default function browserScreenshotExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "browser_open",
		label: "Browser Open",
		description: "Open a URL or local HTML file in a persistent Playwright browser session.",
		promptSnippet: "Open a URL or local HTML file in a persistent browser session",
		promptGuidelines: ["Use browser_open before browser_click, browser_type, browser_press, or browser_wait_for."],
		parameters: BrowserOpenParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return withLock(async () => {
				const { source, displaySource } = resolveSource(ctx.cwd, params);
				const page = await ensureSession({
					browserName: params.browser,
					viewportWidth: params.viewportWidth,
					viewportHeight: params.viewportHeight,
				});
				await page.goto(source, { waitUntil: "networkidle" });
				await waitExtra(page, params.waitForMs);
				return {
					content: [{ type: "text", text: `Opened ${displaySource}` }],
					details: { url: page.url(), browser: state.browserName, viewport: { width: state.viewportWidth, height: state.viewportHeight } },
				};
			});
		},
	});

	pi.registerTool({
		name: "browser_click",
		label: "Browser Click",
		description: "Click an element in the current browser session by CSS selector.",
		promptSnippet: "Click an element in the current browser session using a CSS selector",
		parameters: BrowserClickParams,
		async execute(_toolCallId, params) {
			return withLock(async () => {
				const page = await ensureActivePage();
				const locator = page.locator(params.selector).first();
				await locator.waitFor({ state: "visible" });
				await locator.click();
				await waitExtra(page, params.waitForMs);
				return {
					content: [{ type: "text", text: `Clicked ${params.selector}` }],
					details: { url: page.url(), selector: params.selector },
				};
			});
		},
	});

	pi.registerTool({
		name: "browser_type",
		label: "Browser Type",
		description: "Type text into an input or editable element in the current browser session.",
		promptSnippet: "Type text into the current browser session using a CSS selector",
		parameters: BrowserTypeParams,
		async execute(_toolCallId, params) {
			return withLock(async () => {
				const page = await ensureActivePage();
				const locator = page.locator(params.selector).first();
				await locator.waitFor({ state: "visible" });
				await locator.click();

				const clearFirst = params.clearFirst ?? true;
				const delay = Math.max(0, Math.floor(params.delayMs ?? 0));
				if (clearFirst) {
					await locator.fill("");
				}

				if (delay > 0) {
					await locator.pressSequentially(params.text, { delay });
				} else if (clearFirst) {
					await locator.fill(params.text);
				} else {
					await page.keyboard.insertText(params.text);
				}

				if (params.pressEnter) {
					await page.keyboard.press("Enter");
				}
				await waitExtra(page, params.waitForMs);
				return {
					content: [{ type: "text", text: `Typed into ${params.selector}` }],
					details: { url: page.url(), selector: params.selector, textLength: params.text.length },
				};
			});
		},
	});

	pi.registerTool({
		name: "browser_press",
		label: "Browser Press",
		description: "Press a keyboard key in the current browser session.",
		promptSnippet: "Press a keyboard key in the current browser session",
		parameters: BrowserPressParams,
		async execute(_toolCallId, params) {
			return withLock(async () => {
				const page = await ensureActivePage();
				if (params.selector) {
					await page.locator(params.selector).first().press(params.key);
				} else {
					await page.keyboard.press(params.key);
				}
				await waitExtra(page, params.waitForMs);
				return {
					content: [{ type: "text", text: `Pressed ${params.key}` }],
					details: { url: page.url(), key: params.key, selector: params.selector },
				};
			});
		},
	});

	pi.registerTool({
		name: "browser_wait_for",
		label: "Browser Wait For",
		description: "Wait for text, a selector, or a fixed delay in the current browser session.",
		promptSnippet: "Wait for a selector, text, or delay in the current browser session",
		parameters: BrowserWaitParams,
		async execute(_toolCallId, params) {
			return withLock(async () => {
				const page = await ensureActivePage();
				const stateToWaitFor: WaitState = params.state ?? "visible";
				const timeout = Math.max(1, Math.floor(params.timeoutMs ?? 30000));

				if (params.selector) {
					await page.locator(params.selector).first().waitFor({ state: stateToWaitFor, timeout });
				}
				if (params.text) {
					await page.getByText(params.text).first().waitFor({ state: stateToWaitFor === "attached" ? "visible" : stateToWaitFor === "detached" ? "hidden" : stateToWaitFor, timeout });
				}
				await waitExtra(page, params.waitForMs);

				if (!params.selector && !params.text && !params.waitForMs) {
					throw new Error("Provide selector, text, or waitForMs.");
				}

				return {
					content: [{ type: "text", text: "Wait completed" }],
					details: { url: page.url(), selector: params.selector, text: params.text, state: stateToWaitFor, waitForMs: params.waitForMs },
				};
			});
		},
	});

	pi.registerTool({
		name: "browser_screenshot",
		label: "Browser Screenshot",
		description:
			"Open a web page or local HTML file in a browser engine, or use the current browser session, then take a screenshot of the page or a specific CSS selector and optionally open it in Preview.",
		promptSnippet: "Open a URL or local HTML file in a browser and screenshot the page or a specific element",
		promptGuidelines: [
			"Use browser_screenshot when the user wants a visual snapshot of a local HTML file or a web page.",
			"Prefer passing a CSS selector when the user asks for a specific element.",
			"Use path for local HTML files and url for hosted pages.",
		],
		parameters: BrowserScreenshotParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return withLock(async () => {
				const browserName = params.browser ?? state.browserName;
				const viewportWidth = Math.max(1, Math.floor(params.viewportWidth ?? state.viewportWidth ?? 1440));
				const viewportHeight = Math.max(1, Math.floor(params.viewportHeight ?? state.viewportHeight ?? 900));
				const fullPage = params.fullPage ?? true;
				const openInPreview = params.openInPreview ?? true;
				const outputPath = params.outputPath ? resolve(ctx.cwd, params.outputPath) : defaultScreenshotPath();
				await ensureParentDir(outputPath);

				const page = await ensureSession({ browserName, viewportWidth, viewportHeight });
				let source = currentUrl();
				let displaySource = source ?? "current page";
				if (params.url || params.path) {
					const resolvedSource = resolveSource(ctx.cwd, params);
					source = resolvedSource.source;
					displaySource = resolvedSource.displaySource;
					await page.goto(source, { waitUntil: "networkidle" });
				}

				if (!source) {
					throw new Error("No active page. Use browser_open first, or pass url/path.");
				}

				await waitExtra(page, params.waitForMs);

				if (params.selector) {
					const locator = page.locator(params.selector).first();
					await locator.waitFor({ state: "visible" });
					await locator.screenshot({ path: outputPath });
				} else {
					await page.screenshot({ path: outputPath, fullPage });
				}

				if (openInPreview && process.platform === "darwin") {
					await pi.exec("open", ["-a", "Preview", outputPath]);
				}

				return {
					content: [{ type: "text", text: `Saved browser screenshot to ${outputPath}` }],
					details: {
						source: displaySource,
						selector: params.selector,
						outputPath,
						browser: state.browserName,
						viewport: { width: state.viewportWidth, height: state.viewportHeight },
						fullPage,
						openedInPreview: openInPreview && process.platform === "darwin",
					},
				};
			});
		},
	});

	pi.registerTool({
		name: "browser_start_recording",
		label: "Browser Start Recording",
		description: "Start recording the persistent browser session while actions are performed.",
		promptSnippet: "Start recording the persistent browser session before browser actions",
		parameters: BrowserStartRecordingParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return withLock(async () => {
				const browserName = params.browser ?? state.browserName;
				const viewportWidth = Math.max(1, Math.floor(params.viewportWidth ?? state.viewportWidth ?? 1440));
				const viewportHeight = Math.max(1, Math.floor(params.viewportHeight ?? state.viewportHeight ?? 900));
				const preserveCurrentPage = params.preserveCurrentPage ?? true;
				const preserveUrl = preserveCurrentPage ? currentUrl() : undefined;
				const format: VideoFormat = params.format ?? "mp4";
				const recording: RecordingState = {
					dir: defaultRecordingDir(),
					format,
					finalPath: resolveMaybePath(ctx.cwd, params.outputPath, format),
					openAfterSave: params.openAfterSave ?? true,
				};

				await recreateSession({
					browserName,
					viewportWidth,
					viewportHeight,
					recording,
					preserveUrl,
				});

				return {
					content: [{ type: "text", text: preserveUrl ? `Started recording and reopened ${preserveUrl}` : "Started browser recording" }],
					details: { browser: state.browserName, viewport: { width: state.viewportWidth, height: state.viewportHeight }, preserveUrl, format },
				};
			});
		},
	});

	pi.registerTool({
		name: "browser_stop_recording",
		label: "Browser Stop Recording",
		description: "Stop the browser recording, save the video artifact, and close the recorded session.",
		promptSnippet: "Stop recording the persistent browser session and save the video artifact",
		parameters: BrowserStopRecordingParams,
		async execute() {
			return withLock(async () => {
				const recording = state.recording;
				if (!recording) {
					throw new Error("No browser recording is active.");
				}

				const finalPath = recording.finalPath ?? defaultVideoPath(recording.format);
				const recordingDir = recording.dir;
				const format = recording.format;
				const openAfterSave = recording.openAfterSave;

				await closeSession();
				const rawVideoPath = await findRecordedVideo(recordingDir);
				const savedPath = await convertVideoIfNeeded(pi, rawVideoPath, finalPath, format);
				if (openAfterSave) {
					await openPath(pi, savedPath);
				}
				await rm(recordingDir, { recursive: true, force: true }).catch(() => undefined);

				return {
					content: [{ type: "text", text: `Saved browser recording to ${savedPath}` }],
					details: { outputPath: savedPath, format, opened: openAfterSave && process.platform === "darwin" },
				};
			});
		},
	});

	pi.registerTool({
		name: "browser_close",
		label: "Browser Close",
		description: "Close the current persistent browser session.",
		promptSnippet: "Close the current persistent browser session",
		parameters: BrowserCloseParams,
		async execute() {
			return withLock(async () => {
				const hadSession = Boolean(state.page || state.browser || state.context);
				await closeSession();
				return {
					content: [{ type: "text", text: hadSession ? "Closed browser session" : "No browser session was open" }],
					details: { closed: hadSession },
				};
			});
		},
	});

	pi.on("session_shutdown", async () => {
		await withLock(async () => {
			await closeSession();
		});
	});
}
