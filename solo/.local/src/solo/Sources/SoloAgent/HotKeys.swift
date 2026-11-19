import Carbon.HIToolbox

/// Global shortcuts through Carbon, which needs no privacy permission.
final class HotKeys {
  enum Action: UInt32 {
    case togglePair = 1
    case swap
    case nextDisplay
  }

  private var refs: [EventHotKeyRef] = []
  private var handler: EventHandlerRef?
  private let onPress: (Action) -> Void

  init(onPress: @escaping (Action) -> Void) {
    self.onPress = onPress
  }

  func register() {
    var spec = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(
      GetApplicationEventTarget(),
      { _, event, userData in
        var id = EventHotKeyID()
        GetEventParameter(
          event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
          nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
        let hotKeys = Unmanaged<HotKeys>.fromOpaque(userData!).takeUnretainedValue()
        if let action = Action(rawValue: id.id) { hotKeys.onPress(action) }
        return noErr
      },
      1, &spec, Unmanaged.passUnretained(self).toOpaque(), &handler)

    // ⌃⌥P, ⌃⌥S, ⌃⌥D
    let modifiers = UInt32(controlKey | optionKey)
    let keys: [(Int, Action)] = [
      (kVK_ANSI_P, .togglePair), (kVK_ANSI_S, .swap), (kVK_ANSI_D, .nextDisplay),
    ]
    for (key, action) in keys {
      var ref: EventHotKeyRef?
      let id = EventHotKeyID(signature: OSType(0x534F_4C4F), id: action.rawValue)  // "SOLO"
      let status = RegisterEventHotKey(
        UInt32(key), modifiers, id, GetApplicationEventTarget(), 0, &ref)
      if status == noErr, let ref {
        refs.append(ref)
      } else {
        log("could not register the shortcut for \(action) (\(status))")
      }
    }
  }
}
