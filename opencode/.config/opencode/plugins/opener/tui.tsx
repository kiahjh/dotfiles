import { Plugin } from "@opencode/plugin/tui";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { OfferCard } from "./card";
import { openOffer } from "./launch";
import { isOffer, openLabel, type Offer } from "./model";
import { Opener } from "./rpc";

export default Plugin.define({
  id: "dotfiles.opener.tui",
  setup(context) {
    const api = context.client.rpc(Opener);

    function Offers(props: { sessionID: string }) {
      const [items, setItems] = createSignal<Offer[]>([]);
      const [index, setIndex] = createSignal(0);
      const [busy, setBusy] = createSignal(false);
      const [error, setError] = createSignal("");
      const locallyDismissed = new Set<string>();
      let disposed = false;
      let revision = 0;
      const selected = () => items()[Math.min(index(), Math.max(0, items().length - 1))];
      async function refresh() {
        const current = ++revision;
        const sessionID = props.sessionID;
        try {
          const result = await api.list({ sessionID });
          if (disposed || current !== revision || sessionID !== props.sessionID) return;
          setItems(Array.isArray(result) ? result.filter(isOffer).filter((item) => item.sessionID === sessionID && !locallyDismissed.has(item.id)) : []);
          setError("");
        } catch {
          if (!disposed && current === revision) setError("Could not refresh offered items. Retrying…");
        }
      }
      async function act(item: Offer, open: boolean) {
        if (busy()) return;
        setBusy(true);
        try {
          if (open) await openOffer(item);
          // Hide immediately after a successful launch; a failed acknowledgement
          // must not accidentally offer a second launch in this TUI instance.
          locallyDismissed.add(item.id);
          setItems((list) => list.filter((entry) => entry.id !== item.id));
          try {
            await api.dismiss({ sessionID: item.sessionID, id: item.id });
          } catch {
            if (!open) locallyDismissed.delete(item.id);
            context.ui.toast.show({ title: "Opener", message: open ? "Opened, but could not clear the saved offer. It may return after a reload." : "Could not save dismissal. Retrying refresh shortly.", variant: "warning" });
          }
        } catch (cause) {
          context.ui.toast.show({ title: "Could not open", message: cause instanceof Error ? cause.message : "Opening failed.", variant: "error" });
        } finally {
          setBusy(false);
        }
      }
      createEffect(() => { props.sessionID; setIndex(0); setItems([]); void refresh(); });
      const unsubscribe = api.events.on("changed", (event) => {
        if ((event.data as { sessionID: string }).sessionID === props.sessionID) void refresh();
      });
      // Recover missed events after reconnects, even when the card was empty.
      const timer = setInterval(() => { void refresh(); }, 30_000);
      onCleanup(() => { disposed = true; revision++; unsubscribe(); clearInterval(timer); });

      context.keymap.layer(() => ({
        commands: [{
          id: "dotfiles.opener.open", title: "Open an offered file or link", group: "Opener", palette: true,
          slash: { name: "open" }, enabled: () => items().length > 0 && !busy(),
          run: async () => {
            const item = await context.ui.dialog.select({
              title: "Ready to open", options: items().map((item) => ({ title: item.label, description: item.target, value: item })),
              actions: [{ bind: "ctrl+d", title: "Dismiss", onTrigger: (item) => { context.ui.dialog.clear(); void act(item, false); } }],
            });
            if (item) await act(item, true);
          },
        }],
      }));

      return <Show when={selected()} fallback={<Show when={error()}><text fg={context.theme.text.muted}>{error()}</text></Show>}>
        {(item) => <OfferCard
          theme={context.theme} item={item()} count={items().length}
          index={Math.min(index(), items().length - 1)} busy={busy()}
          onOpen={() => { void act(item(), true); }}
          onDismiss={() => { void act(item(), false); }}
          onDetails={() => { void context.ui.dialog.alert({ title: item().label, message: `${openLabel(item())}\n\n${item().target}` }); }}
          onPrevious={() => setIndex((current) => (Math.min(current, items().length - 1) - 1 + items().length) % items().length)}
          onNext={() => setIndex((current) => (Math.min(current, items().length - 1) + 1) % items().length)}
        />}
      </Show>;
    }

    context.ui.slot({ append: "session.composer.top", render: (props) => <Offers sessionID={props.sessionID} /> });
  },
});
