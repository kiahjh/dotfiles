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
      editor.namespace({ name: "opener", description: "Offer files or links for the user to open when ready. Never launches anything automatically." });
      editor.add({
        name: "offer_open",
        description: "Put a passive Open/Dismiss card above this session's composer. Use for a useful generated artifact, HTML page, image, PDF, folder, text document, or HTTP(S) link. Nothing opens until the user clicks; returns immediately without blocking the agent. Relative paths resolve from the session's directory. Not for scripts, apps, installers, or shell commands.",
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
      event.system.push({ type: "text", text: "When presenting a useful generated artifact or a link the user may want to view, use opener.offer_open to offer it in the passive card above their composer. Do not launch a browser, Preview, Finder, or another foreground app automatically unless the user explicitly requests an immediate launch. Offer only relevant finished items, not every file you touch." });
    });
  },
});
