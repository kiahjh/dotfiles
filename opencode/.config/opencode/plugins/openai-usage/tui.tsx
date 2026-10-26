import { Plugin } from "@opencode/plugin/tui";
import { createSignal } from "solid-js";
import { OpenAIUsage } from "./rpc";
import { formatUsage, type Usage } from "./usage";

export default Plugin.define({
  id: "dotfiles.openai-usage.tui",
  setup(context) {
    const api = context.client.rpc(OpenAIUsage);
    const [usage, setUsage] = createSignal<Usage>();
    let stopped = false;
    let pending: Promise<void> | undefined;
    function refresh(force = false): Promise<void> {
      if (pending) return pending;
      pending = (async () => {
        try {
          const result = await api.read({ refresh: force });
          if (!stopped) setUsage(result as Usage);
        } catch {
          if (!stopped) setUsage({
            status: "unavailable", message: "OpenAI usage plugin could not reach its server component.",
            remaining: null, resetAt: null, banked: null, fetchedAt: Date.now(),
          });
        }
      })().finally(() => { pending = undefined; });
      return pending;
    }
    const render = () => <box height={1} flexShrink={0}>
      <text wrapMode="none" fg={context.theme.text.muted}>
        {usage() ? formatUsage(usage()!) : "[ loading… ]"}
      </text>
    </box>;
    context.ui.slot({
      append: "prompt.footer",
      render,
    });
    context.ui.slot({ append: "home.footer.status", render });
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "dotfiles.openai-usage.show", title: "Show OpenAI subscription usage", group: "OpenAI", palette: true,
        slash: { name: "usage" },
        run: async () => {
          await refresh(true);
          const current = usage();
          await context.ui.dialog.alert({
            title: "OpenAI subscription usage",
            message: current?.status === "ok"
              ? `${formatUsage(current)}\n\nUpdated ${new Date(current.fetchedAt).toLocaleString()}\nBanked resets: ${current.banked ?? "not reported"}`
              : current?.message ?? "Usage is loading.",
          });
        },
      }],
    }));
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 60_000);
    return () => { stopped = true; clearInterval(timer); };
  },
});
