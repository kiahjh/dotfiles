import { getSupportedThinkingLevels, type ModelThinkingLevel } from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	ThinkingSelectorComponent,
} from "@earendil-works/pi-coding-agent";

const FALLBACK_LEVELS: ModelThinkingLevel[] = ["off", "minimal", "low", "medium", "high"];

export default function thinkingExtension(pi: ExtensionAPI): void {
	async function showThinkingPicker(ctx: ExtensionCommandContext): Promise<void> {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("The thinking-level picker requires TUI mode", "error");
			return;
		}

		const availableLevels = ctx.model ? getSupportedThinkingLevels(ctx.model) : FALLBACK_LEVELS;
		const selectedLevel = await ctx.ui.custom<ModelThinkingLevel | null>((tui, _theme, _keybindings, done) => {
			const selector = new ThinkingSelectorComponent(
				pi.getThinkingLevel(),
				availableLevels,
				(level) => done(level),
				() => done(null),
			);
			const selectList = selector.getSelectList();

			return {
				render: (width: number) => selector.render(width),
				invalidate: () => selector.invalidate(),
				handleInput: (data: string) => {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		});

		if (!selectedLevel) return;

		pi.setThinkingLevel(selectedLevel);
		ctx.ui.notify(`Thinking level: ${pi.getThinkingLevel()}`, "info");
	}

	for (const command of ["thinking", "effort"]) {
		pi.registerCommand(command, {
			description: "Select the thinking level",
			handler: async (_args, ctx) => showThinkingPicker(ctx),
		});
	}
}
