import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error.code === "ENOENT" || error.code === "ENOTDIR")
	);
}

export default function dashExtension(pi: ExtensionAPI): void {
	pi.registerCommand("dash", {
		description: "Open the current project's agent dashboard",
		handler: async (_args, ctx) => {
			const gitRoot = await pi.exec("git", ["-C", ctx.cwd, "rev-parse", "--show-toplevel"], { timeout: 2_000 });
			const projectRoot = gitRoot.code === 0 && gitRoot.stdout.trim() ? gitRoot.stdout.trim() : ctx.cwd;
			const dashboardPath = join(projectRoot, "scratch", "agent", "dashboard.html");

			try {
				const dashboard = await stat(dashboardPath);
				if (!dashboard.isFile()) {
					ctx.ui.notify("No dashboard.", "info");
					return;
				}
			} catch (error) {
				if (isMissingPathError(error)) {
					ctx.ui.notify("No dashboard.", "info");
					return;
				}
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Could not access dashboard: ${message}`, "error");
				return;
			}

			const opener =
				process.platform === "darwin"
					? { command: "open", args: [dashboardPath] }
					: process.platform === "linux"
						? { command: "xdg-open", args: [dashboardPath] }
						: process.platform === "win32"
							? { command: "cmd", args: ["/c", "start", "", dashboardPath] }
							: undefined;

			if (!opener) {
				ctx.ui.notify(`Could not open dashboard on this platform: ${dashboardPath}`, "error");
				return;
			}

			const result = await pi.exec(opener.command, opener.args, { timeout: 10_000 });
			if (result.code !== 0) {
				const message = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
				ctx.ui.notify(`Could not open dashboard: ${message}`, "error");
				return;
			}

			ctx.ui.notify("Opened dashboard.", "info");
		},
	});
}
