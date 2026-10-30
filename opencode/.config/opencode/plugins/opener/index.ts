import { Plugin } from "@opencode/plugin";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { displayLabel, resolveTarget } from "./model";
import { createQueue } from "./queue";
import { Opener } from "./rpc";

export default Plugin.define({
  id: "dotfiles.opener",
  async setup(ctx) {
    const queue = createQueue(ctx.storage);
    const registration = await ctx.rpc.register(Opener, {
      list: (input) => queue.list((input as { sessionID: string }).sessionID),
      dismiss: async (input) => {
        const { sessionID, id } = input as { sessionID: string; id: string };
        await queue.dismiss(sessionID, id);
        await registration.events.emit("changed", { sessionID });
        return null;
      },
    });
    await ctx.tool.transform((editor) => {
      editor.namespace({ name: "opener", description: "Offer a finished artifact you made so the user can open it with one click. Never launches anything automatically." });
      editor.add({
        name: "offer_open",
        description: "Put an Open/Dismiss card above this session's composer for a finished artifact you created for the user to look at, such as an HTML report, image, PDF, or Markdown document, or a local preview server you started. Use it instead of launching an app yourself. Don't use it for files you only edited or read, or for links you're citing. Nothing opens until the user clicks; returns immediately. Relative paths resolve from the session's directory.",
        input: {
          type: "object",
          properties: { target: { type: "string", minLength: 1 }, label: { type: "string", maxLength: 120 } },
          required: ["target"], additionalProperties: false,
        },
        options: { namespace: "opener", codemode: true },
        execute: async (input, context) => {
          const { target, label } = input as { target: string; label?: string };
          const session = await ctx.session.get({ sessionID: context.sessionID });
          const resolved = await resolveTarget(target, session.location.directory);
          const item = await queue.add({
            ...resolved, id: randomUUID(), sessionID: context.sessionID,
            label: displayLabel(label ?? resolved.label) || resolved.label, hostname: hostname(),
          });
          await registration.events.emit("changed", { sessionID: context.sessionID });
          return { content: `Offered “${item.label}” above the composer. Nothing was opened. The user can open or dismiss it whenever ready.`, metadata: { offer: item } };
        },
      });
    });
    await ctx.session.hook("context", (event) => {
      event.system.push({ type: "text", text: "Use opener.offer_open only for a finished artifact you created for the user to look at, such as an HTML report, image, PDF, or Markdown document, or a local preview server you started. Offer it once, when it's ready. Don't offer source files you edited, files you only read, or web links you're citing in your reply. Never launch a browser, Preview, Finder, or another app yourself unless the user explicitly asks for an immediate launch." });
    });
  },
});
