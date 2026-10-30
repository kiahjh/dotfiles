import type { ResolvedTheme } from "@opencode/theme/tui";
import { Show, createSignal } from "solid-js";
import { openLabel, type Offer } from "./model";
import { targetSummary } from "./presentation";

type CardProps = {
  theme: ResolvedTheme;
  item: Offer;
  count: number;
  index: number;
  busy: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  onDetails: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

// OpenTUI primitives, not text-art buttons. Keep focus in the prompt; /open
// provides the host's native keyboard-accessible chooser instead of stealing Tab.
function Button(props: { theme: ResolvedTheme; label: string; primary?: boolean; disabled?: boolean; onPress: () => void }) {
  const [hovered, setHovered] = createSignal(false);
  const [pressed, setPressed] = createSignal(false);
  const background = () => props.primary
    ? props.disabled ? props.theme.background.action.primary.focused
      : pressed() ? props.theme.hue.interactive[300]
      : hovered() ? props.theme.hue.interactive[100] : props.theme.background.action.primary.focused
    : hovered() && !props.disabled ? props.theme.background.action.secondary.hovered : props.theme.background.action.secondary.base;
  const foreground = () => props.disabled ? props.theme.text.action.primary.disabled
    : props.primary ? props.theme.text.action.primary.focused
    : hovered() ? props.theme.text.action.secondary.hovered : props.theme.text.action.secondary.base;
  return <box
    flexShrink={0} paddingLeft={1} paddingRight={1} backgroundColor={background()}
    onMouseOver={() => setHovered(true)}
    onMouseOut={() => { setHovered(false); setPressed(false); }}
    onMouseDown={(event) => { if (event.button === 0 && !props.disabled) { event.stopPropagation(); setPressed(true); } }}
    onMouseUp={(event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const activate = pressed() && !props.disabled;
      setPressed(false);
      if (activate) props.onPress();
    }}
  ><text selectable={false} fg={foreground()}>{props.label}</text></box>;
}

export function OfferCard(props: CardProps) {
  return <box
    width="100%" flexDirection="column" flexShrink={0} marginBottom={1}
    border={["left"]} borderColor={props.theme.hue.accent[200]}
    backgroundColor={props.theme.decrease(props.theme.background.raised.base)}
    paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}
  >
    <box flexDirection="row" justifyContent="space-between" gap={1}>
      <text fg={props.theme.text.muted}>Ready to open</text>
      <Show when={props.count > 1}>
        <box flexDirection="row" gap={1} flexShrink={0}>
          <Button theme={props.theme} label="‹" disabled={props.busy} onPress={props.onPrevious} />
          <text fg={props.theme.text.muted}>{props.index + 1} of {props.count}</text>
          <Button theme={props.theme} label="›" disabled={props.busy} onPress={props.onNext} />
        </box>
      </Show>
    </box>
    <text fg={props.theme.text.base} wrapMode="none"><b>{props.item.label}</b></text>
    <text fg={props.theme.text.muted} wrapMode="none">{targetSummary(props.item)}</text>
    <box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
      <Button theme={props.theme} primary label={props.busy ? "Opening…" : `${openLabel(props.item)} ↗`} disabled={props.busy} onPress={props.onOpen} />
      <Button theme={props.theme} label="Dismiss" disabled={props.busy} onPress={props.onDismiss} />
      <Button theme={props.theme} label="Details" disabled={props.busy} onPress={props.onDetails} />
      <box flexGrow={1} />
      <text fg={props.theme.text.muted}>/open</text>
    </box>
  </box>;
}
