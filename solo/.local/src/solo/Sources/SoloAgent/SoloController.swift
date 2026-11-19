import AppKit
import ApplicationServices
import SoloCore

private func windowEventCallback(
  _ observer: AXObserver,
  _ element: AXUIElement,
  _ notification: CFString,
  _ refcon: UnsafeMutableRawPointer?
) {
  guard let refcon else { return }
  var pid: pid_t = 0
  AXUIElementGetPid(element, &pid)
  Unmanaged<SoloController>.fromOpaque(refcon).takeUnretainedValue().windowChanged(pid: pid)
}

private struct Screen {
  let id: DisplayID
  /// Accessibility coordinates.
  let frame: CGRect
  /// The usable area, without the menu bar and Dock.
  let area: CGRect
}

final class SoloController: NSObject {
  private let gap: CGFloat
  private var world = World()
  private var observers: [pid_t: AXObserver] = [:]
  private var hotKeys: HotKeys?
  private var statusItem: NSStatusItem?
  private var permissionTimer: Timer?

  init(gap: CGFloat) {
    self.gap = gap
  }

  func start() {
    AXUIElementSetMessagingTimeout(AXUIElementCreateSystemWide(), 1)
    let prompt = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    if AXIsProcessTrustedWithOptions(prompt) {
      begin()
      return
    }
    log("waiting for Accessibility permission")
    showSetup()
    permissionTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] timer in
      guard AXIsProcessTrusted() else { return }
      timer.invalidate()
      self?.hideSetup()
      self?.begin()
    }
  }

  private func begin() {
    log("Accessibility granted; managing windows")
    let center = NSWorkspace.shared.notificationCenter
    center.addObserver(
      self, selector: #selector(didActivate), name: NSWorkspace.didActivateApplicationNotification,
      object: nil)
    center.addObserver(
      self, selector: #selector(didLaunch), name: NSWorkspace.didLaunchApplicationNotification,
      object: nil)
    center.addObserver(
      self, selector: #selector(didTerminate),
      name: NSWorkspace.didTerminateApplicationNotification, object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(screensChanged),
      name: NSApplication.didChangeScreenParametersNotification, object: nil)

    let screens = self.screens()
    for app in NSWorkspace.shared.runningApplications where isManaged(app) {
      observe(app)
      if let display = display(of: app.processIdentifier, among: screens) {
        world.locate(app.processIdentifier, on: display)
      }
    }

    let hotKeys = HotKeys { [weak self] action in self?.perform(action) }
    hotKeys.register()
    self.hotKeys = hotKeys

    if let app = NSWorkspace.shared.frontmostApplication { show(app) }
  }

  // MARK: Events

  @objc private func didActivate(_ notification: Notification) {
    guard let app = runningApplication(notification) else { return }
    show(app)
  }

  @objc private func didLaunch(_ notification: Notification) {
    guard let app = runningApplication(notification), isManaged(app) else { return }
    // A new app may not answer Accessibility requests right away.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.observe(app) }
  }

  @objc private func didTerminate(_ notification: Notification) {
    guard let app = runningApplication(notification) else { return }
    let pid = app.processIdentifier
    observers.removeValue(forKey: pid)
    render(world.remove(pid))
  }

  @objc private func screensChanged() {
    render(Set(screens().map(\.id)))
  }

  /// A window opened or took focus.
  func windowChanged(pid: pid_t) {
    if let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier == pid {
      show(front)
    } else if let home = world.homes[pid], world.layouts[home]?.apps.contains(pid) == true {
      render([home])
    }
  }

  private func perform(_ action: HotKeys.Action) {
    guard let app = NSWorkspace.shared.frontmostApplication, isManaged(app) else { return }
    let pid = app.processIdentifier
    guard let display = world.homes[pid] else { return }
    debug("\(action) on display \(display)")
    switch action {
    case .togglePair:
      if world.togglePair(on: display) { render([display]) }
    case .swap:
      if world.swap(on: display) { render([display]) }
    case .nextDisplay:
      let ids = screens().sorted { ($0.frame.minX, $0.frame.minY) < ($1.frame.minX, $1.frame.minY) }
        .map(\.id)
      guard ids.count > 1, let index = ids.firstIndex(of: display) else { return }
      render(world.activate(pid, on: ids[(index + 1) % ids.count]))
    }
  }

  // MARK: Layout

  /// The app became active: show it on the display its window is on.
  private func show(_ app: NSRunningApplication, retry: Bool = true) {
    guard isManaged(app) else { return }
    observe(app)
    let pid = app.processIdentifier
    // An app with no standard window (Finder after a desktop click, an app
    // whose last window closed) changes nothing until it opens one.
    guard let display = display(of: pid, among: screens()) else {
      if retry {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
          if NSWorkspace.shared.frontmostApplication?.processIdentifier == pid {
            self?.show(app, retry: false)
          }
        }
      }
      return
    }
    debug("show \(app.localizedName ?? "\(pid)") on display \(display)")
    render(world.activate(pid, on: display))
  }

  private func render(_ displays: Set<DisplayID>) {
    let screens = self.screens()
    for display in displays {
      guard let screen = screens.first(where: { $0.id == display }) else { continue }
      let plan = world.plan(for: display)
      for placement in plan.shown {
        guard let app = NSRunningApplication(processIdentifier: placement.app) else { continue }
        if app.isHidden { app.unhide() }
        if let window = Window.main(of: placement.app) {
          Window.place(window, in: Geometry.frame(for: placement.slot, in: screen.area, gap: gap))
        }
      }
      for pid in plan.hidden {
        guard let app = NSRunningApplication(processIdentifier: pid), !app.isHidden, !app.isActive
        else { continue }
        app.hide()
      }
    }
  }

  // MARK: Helpers

  private func isManaged(_ app: NSRunningApplication) -> Bool {
    app.activationPolicy == .regular && app.processIdentifier != getpid() && !app.isTerminated
  }

  private func runningApplication(_ notification: Notification) -> NSRunningApplication? {
    notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
  }

  private func observe(_ app: NSRunningApplication) {
    let pid = app.processIdentifier
    guard observers[pid] == nil else { return }
    var created: AXObserver?
    guard AXObserverCreate(pid, windowEventCallback, &created) == .success, let observer = created
    else { return }
    let element = AXUIElementCreateApplication(pid)
    let refcon = Unmanaged.passUnretained(self).toOpaque()
    let added = [kAXWindowCreatedNotification, kAXFocusedWindowChangedNotification].filter {
      AXObserverAddNotification(observer, element, $0 as CFString, refcon) == .success
    }
    // Try again on the next activation if the app wasn't ready.
    guard !added.isEmpty else { return }
    CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .defaultMode)
    observers[pid] = observer
  }

  private func screens() -> [Screen] {
    let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
    return NSScreen.screens.compactMap { screen in
      guard
        let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")]
          as? NSNumber
      else { return nil }
      return Screen(
        id: number.uint32Value,
        frame: Geometry.flipped(screen.frame, primaryHeight: primaryHeight),
        area: Geometry.flipped(screen.visibleFrame, primaryHeight: primaryHeight))
    }
  }

  private func display(of pid: pid_t, among screens: [Screen]) -> DisplayID? {
    guard let window = Window.main(of: pid), let frame = Window.frame(of: window) else {
      return nil
    }
    return Geometry.display(of: frame, among: screens.map { ($0.id, $0.frame) })
  }

  // MARK: Setup

  private func showSetup() {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    if let image = NSImage(
      systemSymbolName: "rectangle.split.2x1", accessibilityDescription: "Solo setup")
    {
      item.button?.image = image
    } else {
      item.button?.title = "S"
    }
    item.button?.toolTip = "Solo needs Accessibility permission"

    let menu = NSMenu()
    let heading = NSMenuItem(
      title: "Solo needs Accessibility to arrange windows", action: nil, keyEquivalent: "")
    heading.isEnabled = false
    menu.addItem(heading)
    menu.addItem(.separator())
    let open = NSMenuItem(
      title: "Open Accessibility…", action: #selector(openAccessibility), keyEquivalent: "")
    open.target = self
    menu.addItem(open)
    let restart = NSMenuItem(
      title: "Restart Agent After Granting", action: #selector(restart), keyEquivalent: "")
    restart.target = self
    menu.addItem(restart)
    item.menu = menu
    statusItem = item
  }

  private func hideSetup() {
    if let statusItem { NSStatusBar.system.removeStatusItem(statusItem) }
    statusItem = nil
  }

  @objc private func openAccessibility() {
    if let url = URL(
      string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
    {
      NSWorkspace.shared.open(url)
    }
  }

  @objc private func restart() {
    NSApp.terminate(nil)
  }
}
