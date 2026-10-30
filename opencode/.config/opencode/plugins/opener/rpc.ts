import { Rpc } from "@opencode/plugin/rpc";
import { offerSchema } from "./model";

const session = { type: "string", minLength: 4 };

export const Opener = Rpc.define({
  id: "dotfiles.opener",
  events: {
    changed: {
      schema: { type: "object", properties: { sessionID: session }, required: ["sessionID"], additionalProperties: false },
    },
  },
  methods: {
    list: {
      errors: {},
      input: { type: "object", properties: { sessionID: session }, required: ["sessionID"], additionalProperties: false },
      output: { type: "array", items: offerSchema },
    },
    dismiss: {
      errors: {},
      input: { type: "object", properties: { sessionID: session, id: { type: "string" } }, required: ["sessionID", "id"], additionalProperties: false },
      output: { type: "null" },
    },
  },
});
