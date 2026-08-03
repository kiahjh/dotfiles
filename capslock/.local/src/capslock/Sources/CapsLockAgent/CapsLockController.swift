import AppKit
import CapsLockCore
import CoreGraphics
import Foundation
import IOKit.hid

private let leftControlKeyCode = CGKeyCode(59)
private let rightControlKeyCode = CGKeyCode(62)
private let escapeKeyCode = CGKeyCode(53)
private let returnKeyCode = CGKeyCode(36)
private let semicolonKeyCode = CGKeyCode(41)
private let semicolonLayerKeyCode = CGKeyCode(79)  // F18
private let navigationKeyCodes: [CGKeyCode: CGKeyCode] = [
  4: 123,  // H → Left
  38: 125,  // J → Down
  40: 126,  // K → Up
  37: 124,  // L → Right
]
private let preservedTapModifiers: CGEventFlags = [
  .maskShift,
  .maskControl,
  .maskAlternate,
  .maskCommand,
  .maskSecondaryFn,
  .maskAlphaShift,
]
private let syntheticEventMarker: Int64 = 0x4341_5053_4553_43

private struct DualRoleKey {
  var tapState: TapHoldState
  var tapFlags: CGEventFlags = []
  let tapKeyCode: CGKeyCode
  let tapKeyName: String
  let preservesTapModifiers: Bool
}

private struct PermissionState: Equatable {
  let canListen: Bool
  let canPost: Bool

  var isGranted: Bool {
    canListen && canPost
  }
}

private func eventMask(for types: [CGEventType]) -> CGEventMask {
  types.reduce(CGEventMask(0)) { mask, type in
    mask | (CGEventMask(1) << type.rawValue)
  }
}

private func dualRoleEventCallback(
  proxy: CGEventTapProxy,
  type: CGEventType,
  event: CGEvent,
  userInfo: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
  guard let userInfo else { return Unmanaged.passUnretained(event) }
  let controller = Unmanaged<CapsLockController>.fromOpaque(userInfo).takeUnretainedValue()
  return controller.handleEvent(type: type, event: event)
    ? nil
    : Unmanaged.passUnretained(event)
}

private func keyboardDeviceChangedCallback(
  context: UnsafeMutableRawPointer?,
  result: IOReturn,
  sender: UnsafeMutableRawPointer?,
  device: IOHIDDevice
) {
  guard let context else { return }
  let controller = Unmanaged<CapsLockController>.fromOpaque(context).takeUnretainedValue()
  controller.scheduleMappingRefresh()
}

final class CapsLockController: NSObject {
  private let mappingManager = HIDMappingManager()
  private var dualRoleKeys: [CGKeyCode: DualRoleKey]
  private var semicolonLayerState: TapHoldState
  private var semicolonTapFlags: CGEventFlags = []
  private var activeNavigationKeys: [CGKeyCode: CGKeyCode] = [:]

  private var eventTap: CFMachPort?
  private var eventTapSource: CFRunLoopSource?
  private var permissionTimer: Timer?
  private var mappingRefreshTimer: Timer?
  private var keyboardManager: IOHIDManager?
  private var isKeyboardManagerOpen = false
  private var lastKeyboardOpenError: IOReturn?
  private var statusItem: NSStatusItem?
  private var lastPermissionState: PermissionState?
  private var lastRuntimeStatus: AgentRuntimeStatus?
  private var hasRequestedListenPermission = false
  private var hasRequestedPostPermission = false

  init(tapTimeoutMilliseconds: UInt64) {
    self.dualRoleKeys = [
      leftControlKeyCode: DualRoleKey(
        tapState: TapHoldState(tapTimeoutMilliseconds: tapTimeoutMilliseconds),
        tapKeyCode: escapeKeyCode,
        tapKeyName: "Escape",
        preservesTapModifiers: false
      ),
      rightControlKeyCode: DualRoleKey(
        tapState: TapHoldState(tapTimeoutMilliseconds: tapTimeoutMilliseconds),
        tapKeyCode: returnKeyCode,
        tapKeyName: "Return",
        preservesTapModifiers: true
      ),
    ]
    self.semicolonLayerState = TapHoldState(
      tapTimeoutMilliseconds: tapTimeoutMilliseconds
    )
    super.init()
  }

  func start() {
    applyMapping(reason: "launch")
    startKeyboardMonitoring()
    startWorkspaceMonitoring()

    refreshPermissions(requestIfNeeded: true)
    permissionTimer = Timer.scheduledTimer(
      withTimeInterval: 2,
      repeats: true
    ) { [weak self] _ in
      self?.refreshPermissions(requestIfNeeded: true)
    }
  }

  func stop() {
    permissionTimer?.invalidate()
    permissionTimer = nil
    mappingRefreshTimer?.invalidate()
    mappingRefreshTimer = nil

    NSWorkspace.shared.notificationCenter.removeObserver(self)
    stopEventTap()

    if let keyboardManager {
      IOHIDManagerUnscheduleFromRunLoop(
        keyboardManager,
        CFRunLoopGetMain(),
        CFRunLoopMode.commonModes.rawValue
      )
      if isKeyboardManagerOpen {
        IOHIDManagerClose(keyboardManager, IOOptionBits(kIOHIDOptionsTypeNone))
      }
    }
    keyboardManager = nil
    isKeyboardManagerOpen = false
    AgentStatusStore.remove()
  }

  func handleEvent(type: CGEventType, event: CGEvent) -> Bool {
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      resetAllInteractionState()
      if let eventTap {
        CGEvent.tapEnable(tap: eventTap, enable: true)
      }
      return false
    }

    if event.getIntegerValueField(.eventSourceUserData) == syntheticEventMarker {
      return false
    }

    switch type {
    case .flagsChanged:
      semicolonLayerState.interfere()
      handleFlagsChanged(event)

    case .keyDown, .keyUp:
      let keyCode = CGKeyCode(event.getIntegerValueField(.keyboardEventKeycode))

      if keyCode == semicolonLayerKeyCode {
        interfereWithAllDualRoleKeys()
        handleSemicolonLayerKey(type: type, event: event)
        return true
      }

      semicolonLayerState.interfere()
      remapNavigationKeyIfNeeded(type: type, event: event, keyCode: keyCode)
      interfereWithAllDualRoleKeys()

    case .leftMouseDown, .leftMouseUp,
      .rightMouseDown, .rightMouseUp,
      .otherMouseDown, .otherMouseUp,
      .scrollWheel:
      semicolonLayerState.interfere()
      interfereWithAllDualRoleKeys()

    default:
      break
    }

    return false
  }

  func scheduleMappingRefresh() {
    mappingRefreshTimer?.invalidate()
    mappingRefreshTimer = Timer.scheduledTimer(
      withTimeInterval: 0.5,
      repeats: false
    ) { [weak self] _ in
      self?.applyMapping(reason: "keyboard change")
    }
  }

  private func handleSemicolonLayerKey(type: CGEventType, event: CGEvent) {
    if type == .keyDown {
      guard !semicolonLayerState.isTriggerDown else { return }

      semicolonTapFlags = event.flags.intersection(preservedTapModifiers)
      semicolonLayerState.triggerDown(
        at: event.timestamp,
        eligibleForTap: hasNoMouseButtonsDown()
      )
      return
    }

    guard type == .keyUp else { return }

    let output = semicolonLayerState.triggerUp(at: event.timestamp)
    let tapFlags = semicolonTapFlags
    semicolonTapFlags = []

    if output == .tap {
      postKey(semicolonKeyCode, named: "Semicolon", flags: tapFlags)
    }
  }

  private func remapNavigationKeyIfNeeded(
    type: CGEventType,
    event: CGEvent,
    keyCode: CGKeyCode
  ) {
    var navigationKeyCode = activeNavigationKeys[keyCode]

    if navigationKeyCode == nil,
      type == .keyDown,
      semicolonLayerState.isTriggerDown
    {
      navigationKeyCode = navigationKeyCodes[keyCode]
      if let navigationKeyCode {
        activeNavigationKeys[keyCode] = navigationKeyCode
      }
    }

    guard let navigationKeyCode else { return }

    if type == .keyUp {
      activeNavigationKeys.removeValue(forKey: keyCode)
    }

    event.setIntegerValueField(
      .keyboardEventKeycode,
      value: Int64(navigationKeyCode)
    )
    event.flags = event.flags.union(.maskNumericPad)
  }

  private func handleFlagsChanged(_ event: CGEvent) {
    let keyCode = CGKeyCode(event.getIntegerValueField(.keyboardEventKeycode))

    guard var dualRoleKey = dualRoleKeys[keyCode] else {
      interfereWithAllDualRoleKeys()
      return
    }

    let anotherDualRoleKeyIsDown = dualRoleKeys.contains {
      $0.key != keyCode && $0.value.tapState.isTriggerDown
    }
    interfereWithAllDualRoleKeys(except: keyCode)

    if dualRoleKey.tapState.isTriggerDown {
      let output = dualRoleKey.tapState.triggerUp(at: event.timestamp)
      let tapFlags = dualRoleKey.tapFlags
      dualRoleKey.tapFlags = []
      dualRoleKeys[keyCode] = dualRoleKey

      if output == .tap {
        postKey(
          dualRoleKey.tapKeyCode,
          named: dualRoleKey.tapKeyName,
          flags: tapFlags
        )
      }
      return
    }

    // A modifier release can be the first event seen after an event tap is
    // recreated. Only a Control-down event may begin a tap candidate.
    guard event.flags.contains(.maskControl) else { return }

    let eligibleForTap: Bool
    if dualRoleKey.preservesTapModifiers {
      dualRoleKey.tapFlags = event.flags.intersection(preservedTapModifiers)
      if !anotherDualRoleKeyIsDown {
        dualRoleKey.tapFlags.remove(.maskControl)
      }
      eligibleForTap = hasNoMouseButtonsDown()
    } else {
      dualRoleKey.tapFlags = []
      eligibleForTap =
        !anotherDualRoleKeyIsDown && hasNoOtherActiveInput(event: event)
    }

    dualRoleKey.tapState.triggerDown(
      at: event.timestamp,
      eligibleForTap: eligibleForTap
    )
    dualRoleKeys[keyCode] = dualRoleKey
  }

  private func interfereWithAllDualRoleKeys(except excludedKeyCode: CGKeyCode? = nil) {
    for keyCode in Array(dualRoleKeys.keys) where keyCode != excludedKeyCode {
      dualRoleKeys[keyCode]?.tapState.interfere()
    }
  }

  private func resetAllInteractionState() {
    for keyCode in Array(dualRoleKeys.keys) {
      dualRoleKeys[keyCode]?.tapState.reset()
      dualRoleKeys[keyCode]?.tapFlags = []
    }
    semicolonLayerState.reset()
    semicolonTapFlags = []
    activeNavigationKeys.removeAll()
  }

  private func hasNoOtherActiveInput(event: CGEvent) -> Bool {
    let disallowedModifiers: CGEventFlags = [
      .maskShift,
      .maskAlternate,
      .maskCommand,
      .maskSecondaryFn,
      .maskAlphaShift,
      .maskHelp,
    ]

    guard event.flags.intersection(disallowedModifiers).isEmpty else {
      return false
    }

    return hasNoMouseButtonsDown()
  }

  private func hasNoMouseButtonsDown() -> Bool {
    !CGEventSource.buttonState(.combinedSessionState, button: .left)
      && !CGEventSource.buttonState(.combinedSessionState, button: .right)
      && !CGEventSource.buttonState(.combinedSessionState, button: .center)
  }

  private func postKey(
    _ keyCode: CGKeyCode,
    named keyName: String,
    flags: CGEventFlags = []
  ) {
    guard CGPreflightPostEventAccess() else {
      log("could not emit \(keyName) because Accessibility permission is missing")
      return
    }

    guard
      let source = CGEventSource(stateID: .privateState),
      let keyDown = CGEvent(
        keyboardEventSource: source,
        virtualKey: keyCode,
        keyDown: true
      ),
      let keyUp = CGEvent(
        keyboardEventSource: source,
        virtualKey: keyCode,
        keyDown: false
      )
    else {
      log("could not create synthetic \(keyName) events")
      return
    }

    for event in [keyDown, keyUp] {
      event.flags = flags
      event.setIntegerValueField(.eventSourceUserData, value: syntheticEventMarker)
      event.post(tap: .cghidEventTap)
    }
  }

  private func refreshPermissions(requestIfNeeded: Bool) {
    var permissions = PermissionState(
      canListen: CGPreflightListenEventAccess(),
      canPost: CGPreflightPostEventAccess()
    )

    if requestIfNeeded && !permissions.canListen && !hasRequestedListenPermission {
      hasRequestedListenPermission = true
      _ = CGRequestListenEventAccess()
      permissions = PermissionState(
        canListen: CGPreflightListenEventAccess(),
        canPost: CGPreflightPostEventAccess()
      )
    }

    // Request one privacy category at a time. macOS can discard the second
    // request when two consent prompts are initiated together.
    if requestIfNeeded
      && permissions.canListen
      && !permissions.canPost
      && !hasRequestedPostPermission
    {
      hasRequestedPostPermission = true
      _ = CGRequestPostEventAccess()
      permissions = PermissionState(
        canListen: CGPreflightListenEventAccess(),
        canPost: CGPreflightPostEventAccess()
      )
    }

    if permissions != lastPermissionState {
      log(
        "permissions — Input Monitoring: \(permissions.canListen ? "granted" : "missing"), "
          + "Accessibility: \(permissions.canPost ? "granted" : "missing")"
      )
      lastPermissionState = permissions
    }

    updateKeyboardMonitoring(canListen: permissions.canListen)

    if permissions.isGranted {
      if eventTap == nil {
        installEventTap()
      }
    } else {
      stopEventTap()
    }

    updateStatusItem(permissions: permissions)

    let runtimeStatus = AgentRuntimeStatus(
      processIdentifier: getpid(),
      canListen: permissions.canListen,
      canPost: permissions.canPost,
      eventTapRunning: eventTap != nil
    )
    if runtimeStatus != lastRuntimeStatus {
      AgentStatusStore.write(runtimeStatus)
      lastRuntimeStatus = runtimeStatus
    }
  }

  private func installEventTap() {
    let observedEvents: [CGEventType] = [
      .flagsChanged,
      .keyDown,
      .keyUp,
      .leftMouseDown,
      .leftMouseUp,
      .rightMouseDown,
      .rightMouseUp,
      .otherMouseDown,
      .otherMouseUp,
      .scrollWheel,
    ]

    let context = Unmanaged.passUnretained(self).toOpaque()
    guard
      let eventTap = CGEvent.tapCreate(
        tap: .cgSessionEventTap,
        place: .headInsertEventTap,
        options: .defaultTap,
        eventsOfInterest: eventMask(for: observedEvents),
        callback: dualRoleEventCallback,
        userInfo: context
      )
    else {
      log("failed to create the keyboard event tap")
      return
    }

    guard let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0) else {
      CFMachPortInvalidate(eventTap)
      log("failed to create the keyboard event tap run-loop source")
      return
    }

    self.eventTap = eventTap
    self.eventTapSource = source
    CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
    CGEvent.tapEnable(tap: eventTap, enable: true)
    log("event tap started; dual-role keys and navigation layer are ready")
  }

  private func stopEventTap() {
    resetAllInteractionState()

    if let eventTapSource {
      CFRunLoopRemoveSource(CFRunLoopGetMain(), eventTapSource, .commonModes)
    }
    eventTapSource = nil

    if let eventTap {
      CGEvent.tapEnable(tap: eventTap, enable: false)
      CFMachPortInvalidate(eventTap)
    }
    eventTap = nil
  }

  private func applyMapping(reason: String) {
    let change = mappingManager.apply()
    if change.changed > 0 || change.status.failed > 0 {
      log(
        "applied dual-role/layer HID mappings after \(reason): "
          + "\(change.status.applied)/\(change.status.total) keyboards ready, "
          + "\(change.status.failed) failed"
      )
    }
  }

  private func updateKeyboardMonitoring(canListen: Bool) {
    guard let keyboardManager else { return }

    if !canListen {
      if isKeyboardManagerOpen {
        IOHIDManagerClose(keyboardManager, IOOptionBits(kIOHIDOptionsTypeNone))
        isKeyboardManagerOpen = false
      }
      return
    }

    guard !isKeyboardManagerOpen else { return }

    let result = IOHIDManagerOpen(keyboardManager, IOOptionBits(kIOHIDOptionsTypeNone))
    if result == kIOReturnSuccess {
      isKeyboardManagerOpen = true
      lastKeyboardOpenError = nil
      log("keyboard connection monitoring started")
      return
    }

    if result != lastKeyboardOpenError {
      log("keyboard connection monitoring failed with IOKit error \(result)")
      lastKeyboardOpenError = result
    }
  }

  private func startKeyboardMonitoring() {
    let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
    let keyboardMatch: [String: Any] = [
      kIOHIDDeviceUsagePageKey: NSNumber(value: kHIDPage_GenericDesktop),
      kIOHIDDeviceUsageKey: NSNumber(value: kHIDUsage_GD_Keyboard),
    ]

    IOHIDManagerSetDeviceMatching(manager, keyboardMatch as CFDictionary)

    let context = Unmanaged.passUnretained(self).toOpaque()
    IOHIDManagerRegisterDeviceMatchingCallback(
      manager,
      keyboardDeviceChangedCallback,
      context
    )
    IOHIDManagerRegisterDeviceRemovalCallback(
      manager,
      keyboardDeviceChangedCallback,
      context
    )
    IOHIDManagerScheduleWithRunLoop(
      manager,
      CFRunLoopGetMain(),
      CFRunLoopMode.commonModes.rawValue
    )

    keyboardManager = manager
  }

  private func startWorkspaceMonitoring() {
    let center = NSWorkspace.shared.notificationCenter
    center.addObserver(
      self,
      selector: #selector(workspaceWillSleep),
      name: NSWorkspace.willSleepNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(workspaceDidWake),
      name: NSWorkspace.didWakeNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(sessionDidResignActive),
      name: NSWorkspace.sessionDidResignActiveNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(sessionDidBecomeActive),
      name: NSWorkspace.sessionDidBecomeActiveNotification,
      object: nil
    )
  }

  @objc private func workspaceWillSleep() {
    resetAllInteractionState()
  }

  @objc private func workspaceDidWake() {
    resetAllInteractionState()
    scheduleMappingRefresh()
    refreshPermissions(requestIfNeeded: false)
  }

  @objc private func sessionDidResignActive() {
    resetAllInteractionState()
  }

  @objc private func sessionDidBecomeActive() {
    resetAllInteractionState()
    scheduleMappingRefresh()
    refreshPermissions(requestIfNeeded: false)
  }

  private func updateStatusItem(permissions: PermissionState) {
    guard !permissions.isGranted || eventTap == nil else {
      if let statusItem {
        NSStatusBar.system.removeStatusItem(statusItem)
        self.statusItem = nil
      }
      return
    }

    let item: NSStatusItem
    if let statusItem {
      item = statusItem
    } else {
      item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
      self.statusItem = item
    }

    if let image = NSImage(
      systemSymbolName: "capslock", accessibilityDescription: "Caps Lock setup")
    {
      item.button?.image = image
    } else {
      item.button?.title = "⇪"
    }
    item.button?.toolTip = "Caps Lock needs permission"

    let menu = NSMenu()
    let heading = NSMenuItem(title: "Caps Lock setup", action: nil, keyEquivalent: "")
    heading.isEnabled = false
    menu.addItem(heading)
    menu.addItem(.separator())

    if !permissions.canListen {
      let inputMonitoring = NSMenuItem(
        title: "Open Input Monitoring…",
        action: #selector(openInputMonitoringSettings),
        keyEquivalent: ""
      )
      inputMonitoring.target = self
      menu.addItem(inputMonitoring)
    }

    if !permissions.canPost {
      let accessibility = NSMenuItem(
        title: "Open Accessibility…",
        action: #selector(openAccessibilitySettings),
        keyEquivalent: ""
      )
      accessibility.target = self
      menu.addItem(accessibility)
    }

    let retry = NSMenuItem(
      title: "Request Permissions Again",
      action: #selector(requestPermissionsAgain),
      keyEquivalent: ""
    )
    retry.target = self
    menu.addItem(retry)

    menu.addItem(.separator())
    let restart = NSMenuItem(
      title: "Restart Agent After Granting",
      action: #selector(restartAgent),
      keyEquivalent: ""
    )
    restart.target = self
    menu.addItem(restart)
    item.menu = menu
  }

  @objc private func openInputMonitoringSettings() {
    openPrivacySettings(anchor: "Privacy_ListenEvent")
  }

  @objc private func openAccessibilitySettings() {
    openPrivacySettings(anchor: "Privacy_Accessibility")
  }

  @objc private func requestPermissionsAgain() {
    hasRequestedListenPermission = false
    hasRequestedPostPermission = false
    refreshPermissions(requestIfNeeded: true)
  }

  @objc private func restartAgent() {
    NSApp.terminate(nil)
  }

  private func openPrivacySettings(anchor: String) {
    guard
      let url = URL(
        string: "x-apple.systempreferences:com.apple.preference.security?\(anchor)"
      )
    else { return }
    NSWorkspace.shared.open(url)
  }
}
