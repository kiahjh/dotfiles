/**
 * Compact footer for pi.
 *
 * Keeps the default footer shape (cwd line, status line, optional extension
 * statuses), but makes the status line much denser:
 *
 *   [#####-----] 51.9%/272k                         ⚡ 5.5 xhigh
 *
 * GPT model IDs are displayed without the `gpt-` prefix. The lightning icon is
 * shown only when the @benvargas/pi-openai-fast config says fast mode is active
 * for the current model.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const FAST_CONFIG_BASENAME = "pi-openai-fast.json";
const FAST_ICON = "⚡︎";
const PROGRESS_WIDTH = 20;
const DEFAULT_SUPPORTED_MODEL_KEYS = [
	"openai/gpt-5.4",
	"openai/gpt-5.5",
	"openai-codex/gpt-5.4",
	"openai-codex/gpt-5.5",
];

interface FastConfigFile {
	persistState?: boolean;
	active?: boolean;
	supportedModels?: string[];
}

interface FastSupportedModel {
	provider: string;
	id: string;
}

interface ResolvedFastConfig {
	active: boolean;
	supportedModels: FastSupportedModel[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSupportedModelKey(value: string): FastSupportedModel | undefined {
	const trimmed = value.trim();
	const slashIndex = trimmed.indexOf("/");
	if (slashIndex <= 0 || slashIndex >= trimmed.length - 1) return undefined;

	const provider = trimmed.slice(0, slashIndex).trim();
	const id = trimmed.slice(slashIndex + 1).trim();
	if (!provider || !id) return undefined;

	return { provider, id };
}

function normalizeSupportedModelKeys(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) return undefined;

	const normalized: string[] = [];
	for (const entry of value) {
		if (typeof entry !== "string") continue;
		const parsed = parseSupportedModelKey(entry);
		if (!parsed) continue;
		normalized.push(`${parsed.provider}/${parsed.id}`);
	}
	return normalized;
}

function parseSupportedModels(value: readonly string[]): FastSupportedModel[] {
	return value.flatMap((entry) => {
		const parsed = parseSupportedModelKey(entry);
		return parsed ? [parsed] : [];
	});
}

function readFastConfigFile(path: string): FastConfigFile | undefined {
	if (!existsSync(path)) return undefined;

	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
		if (!isRecord(parsed)) return {};

		const config: FastConfigFile = {};
		if (typeof parsed.persistState === "boolean") config.persistState = parsed.persistState;
		if (typeof parsed.active === "boolean") config.active = parsed.active;

		const supportedModels = normalizeSupportedModelKeys(parsed.supportedModels);
		if (supportedModels !== undefined) config.supportedModels = supportedModels;

		return config;
	} catch {
		return undefined;
	}
}

function resolveFastConfig(cwd: string): ResolvedFastConfig {
	const globalConfigPath = join(homedir(), ".pi", "agent", "extensions", FAST_CONFIG_BASENAME);
	const projectConfigPath = join(cwd, ".pi", "extensions", FAST_CONFIG_BASENAME);
	const globalConfig = readFastConfigFile(globalConfigPath) ?? {};
	const projectConfig = readFastConfigFile(projectConfigPath) ?? {};
	const merged = { ...globalConfig, ...projectConfig };

	return {
		// Matches pi-openai-fast startup behavior for config-backed state.
		active: merged.persistState !== false && merged.active === true,
		supportedModels: parseSupportedModels(merged.supportedModels ?? DEFAULT_SUPPORTED_MODEL_KEYS),
	};
}

function isFastEnabledForCurrentModel(ctx: ExtensionContext): boolean {
	const model = ctx.model;
	if (!model) return false;

	const config = resolveFastConfig(ctx.cwd);
	if (!config.active) return false;

	return config.supportedModels.some((supported) => supported.provider === model.provider && supported.id === model.id);
}

function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function sanitizeStatusText(text: string): string {
	return stripAnsi(text)
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function formatModelName(modelId: string): string {
	return modelId.replace(/^gpt-/, "");
}

function progressBar(percent: number | null | undefined): string {
	const value = typeof percent === "number" && Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
	const filled = Math.round((value / 100) * PROGRESS_WIDTH);
	return `[${"#".repeat(filled)}${"-".repeat(PROGRESS_WIDTH - filled)}]`;
}

function formatContext(ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage();
	const percent = usage?.percent;
	const percentText = typeof percent === "number" && Number.isFinite(percent) ? `${percent.toFixed(1)}%` : "?%";
	const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
	return `${progressBar(percent)} ${percentText}/${formatTokens(contextWindow)}`;
}

function formatRightSide(ctx: ExtensionContext, pi: ExtensionAPI): string {
	const modelName = formatModelName(ctx.model?.id || "no-model");
	const parts: string[] = [isFastEnabledForCurrentModel(ctx) ? `${FAST_ICON}${modelName}` : modelName];

	if (ctx.model?.reasoning) {
		const thinkingLevel = pi.getThinkingLevel() || "off";
		parts.push(thinkingLevel === "off" ? "off" : thinkingLevel);
	}

	return parts.join(" ");
}

function formatPwd(ctx: ExtensionContext, branch: string | null): string {
	let pwd = ctx.sessionManager.getCwd();
	const home = process.env.HOME || process.env.USERPROFILE;
	if (home && pwd.startsWith(home)) {
		pwd = `~${pwd.slice(home.length)}`;
	}

	if (branch) {
		pwd = `${pwd} (${branch})`;
	}

	const sessionName = ctx.sessionManager.getSessionName();
	if (sessionName) {
		pwd = `${pwd} • ${sessionName}`;
	}

	return pwd;
}

function twoColumnLine(left: string, right: string, width: number, ellipsis: string): string {
	const minPadding = 2;
	let leftText = left;
	let rightText = right;
	let leftWidth = visibleWidth(leftText);
	let rightWidth = visibleWidth(rightText);

	if (leftWidth > width) {
		leftText = truncateToWidth(leftText, width, ellipsis);
		leftWidth = visibleWidth(leftText);
	}

	if (!rightText) return leftText;

	const availableForRight = width - leftWidth - minPadding;
	if (availableForRight <= 0) return leftText;

	if (rightWidth > availableForRight) {
		rightText = truncateToWidth(rightText, availableForRight, ellipsis);
		rightWidth = visibleWidth(rightText);
	}

	const padding = " ".repeat(Math.max(minPadding, width - leftWidth - rightWidth));
	return leftText + padding + rightText;
}

export default function compactFooter(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					const extensionStatuses = footerData.getExtensionStatuses();
					const statusLine =
						extensionStatuses.size > 0
							? Array.from(extensionStatuses.entries())
									.sort(([a], [b]) => a.localeCompare(b))
									.map(([, text]) => sanitizeStatusText(text))
									.join(" ")
							: "";

					const topLeft = theme.fg("dim", formatRightSide(ctx, pi));
					const topRight = theme.fg("dim", formatPwd(ctx, footerData.getGitBranch()));
					const bottomLeft = theme.fg("dim", formatContext(ctx));
					const bottomRight = statusLine ? theme.fg("dim", statusLine) : "";
					const ellipsis = theme.fg("dim", "...");

					return [twoColumnLine(topLeft, topRight, width, ellipsis), twoColumnLine(bottomLeft, bottomRight, width, ellipsis)];
				},
			};
		});
	});
}
