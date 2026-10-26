import { Rpc } from "@opencode/plugin/rpc";

export const OpenAIUsage = Rpc.define({
  id: "dotfiles.openai-usage",
  events: {},
  methods: {
    read: {
      errors: {},
      input: {
        type: "object",
        properties: { refresh: { type: "boolean" } },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok", "unavailable"] },
          message: { type: "string" },
          remaining: { type: ["number", "null"] },
          resetAt: { type: ["number", "null"] },
          banked: { type: ["number", "null"] },
          fetchedAt: { type: "number" },
        },
        required: ["status", "message", "remaining", "resetAt", "banked", "fetchedAt"],
        additionalProperties: false,
      },
    },
  },
});
