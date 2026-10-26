import { Plugin } from "@opencode/plugin";
import { OpenAIUsage } from "./rpc";
import { readCodexUsage } from "./codex";
import { record, type Usage } from "./usage";

// Credentials stay on the server. Only the normalized usage summary crosses RPC.
export default Plugin.define({
  id: "dotfiles.openai-usage",
  async setup(ctx) {
    const controller = new AbortController();
    let cached: Usage | undefined;
    let pending: Promise<Usage> | undefined;

    function unavailable(message: string): Usage {
      return { status: "unavailable", message, remaining: null, resetAt: null, banked: null, fetchedAt: Date.now() };
    }

    async function read(refresh: boolean): Promise<Usage> {
      const now = Date.now();
      const ttl = cached?.status === "ok" ? 5 * 60_000 : 60_000;
      if (cached && now - cached.fetchedAt < (refresh ? 10_000 : ttl) &&
        (cached.resetAt === null || cached.resetAt > now)) return cached;
      cached = undefined;
      let result: Usage;
      try {
        result = await readCodexUsage(controller.signal);
      } catch (error) {
        result = unavailable(error instanceof Error ? error.message : "Could not read Codex subscription usage.");
      }
      cached = result;
      return result;
    }

    await ctx.rpc.register(OpenAIUsage, {
      read: (input) => {
        if (!pending) {
          pending = read(record(input) && input.refresh === true)
            .catch(() => unavailable("OpenAI usage lookup is unavailable."))
            .finally(() => { pending = undefined; });
        }
        return pending;
      },
    });
    return () => controller.abort();
  },
});
