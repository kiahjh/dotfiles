import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseThemeDocument, resolveThemeDocument } from "@opencode/theme/tui";
import { testRender } from "@opentui/solid";
import { OfferCard } from "./card";
import type { Offer } from "./model";

const themePath = process.env.OPENCODE_TEST_THEME ?? new URL("../../themes/kiahgawa.json", import.meta.url);
const theme = resolveThemeDocument(parseThemeDocument(JSON.parse(readFileSync(themePath, "utf8"))), "dark");
const item: Offer = {
  id: "test", sessionID: "ses_test", label: "Your architecture diagram",
  target: "/private/var/folders/noisy/temporary/directory/diagram.html", kind: "file", destination: "browser", hostname: "test",
};

async function mount(width = 90, busy = false) {
  const actions: string[] = [];
  const session = await testRender(() => <box flexDirection="column">
    <OfferCard theme={theme} item={item} count={2} index={0} busy={busy}
      onOpen={() => actions.push("open")} onDismiss={() => actions.push("dismiss")} onDetails={() => actions.push("details")}
      onPrevious={() => actions.push("previous")} onNext={() => actions.push("next")} />
    <text>PROMPT</text>
  </box>, { width, height: 18 });
  await session.flush();
  function position(label: string) {
    const lines = session.captureCharFrame().split("\n");
    const y = lines.findIndex((line) => line.includes(label));
    expect(y).toBeGreaterThanOrEqual(0);
    return { x: lines[y].indexOf(label), y };
  }
  async function click(label: string) {
    const { x, y } = position(label);
    await session.mockMouse.click(x, y);
    await session.flush();
  }
  return { ...session, actions, position, click };
}

describe("themed opener card", () => {
  test.each([32, 44, 90])("keeps its actions visible at %s columns", async (width) => {
    const ui = await mount(width);
    try {
      const frame = ui.captureCharFrame();
      for (const label of ["Open in browser", "Dismiss", "Details", "HTML · diagram.html", "PROMPT"]) expect(frame).toContain(label);
      expect(frame).not.toContain("/private/var");
      expect(frame).not.toContain("[ Open");
      expect(ui.actions).toEqual([]);
    } finally { await ui.dispose(); }
  });
  test("uses filled theme-colored buttons with hover feedback", async () => {
    const ui = await mount();
    try {
      const button = () => ui.captureSpans().lines.flatMap((line) => line.spans).find((span) => span.text.includes("Open in browser"))!;
      expect(button().bg.toInts()).toEqual(theme.background.action.primary.focused.toInts());
      expect(button().fg.toInts()).toEqual(theme.text.action.primary.focused.toInts());
      const { x, y } = ui.position("Open in browser");
      await ui.mockMouse.moveTo(x, y);
      await ui.flush();
      expect(button().bg.toInts()).not.toEqual(theme.background.action.primary.focused.toInts());
      expect(ui.actions).toEqual([]);
    } finally { await ui.dispose(); }
  });
  test("buttons perform only their own explicit action", async () => {
    const ui = await mount();
    try {
      await ui.click("Details");
      await ui.click("Dismiss");
      await ui.click("›");
      await ui.click("‹");
      await ui.click("Open in browser");
      expect(ui.actions).toEqual(["details", "dismiss", "next", "previous", "open"]);
    } finally { await ui.dispose(); }
  });
  test("busy buttons and an unrelated mouse release never activate", async () => {
    const ui = await mount();
    try {
      const { x, y } = ui.position("Open in browser");
      await ui.mockMouse.release(x, y);
      expect(ui.actions).toEqual([]);
    } finally { await ui.dispose(); }
    const busy = await mount(90, true);
    try {
      await busy.click("Opening…");
      await busy.click("Dismiss");
      expect(busy.actions).toEqual([]);
    } finally { await busy.dispose(); }
  });
});
