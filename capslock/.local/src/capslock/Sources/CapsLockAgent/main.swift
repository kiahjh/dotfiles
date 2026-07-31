import AppKit
import CoreGraphics
import Foundation

private let capsLockVersion = "1.0.0"

private final class AppDelegate: NSObject, NSApplicationDelegate {
  private var controller: CapsLockController?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let timeout = tapTimeoutMilliseconds()
    log("starting CapsLock \(capsLockVersion) with a \(timeout) ms tap timeout")

    let controller = CapsLockController(tapTimeoutMilliseconds: timeout)
    self.controller = controller
    controller.start()
  }

  func applicationWillTerminate(_ notification: Notification) {
    controller?.stop()
  }

  private func tapTimeoutMilliseconds() -> UInt64 {
    let rawValue = ProcessInfo.processInfo.environment["CAPSLOCK_TAP_MILLISECONDS"]
    let requested = rawValue.flatMap(UInt64.init) ?? 200
    return min(max(requested, 50), 1_000)
  }
}

private func printStatus() -> Int32 {
  let mapping = HIDMappingManager().status()
  print("Caps Lock/Return → Control: \(mapping.applied)/\(mapping.total) keyboards")

  guard let runtime = AgentStatusStore.read() else {
    print("Agent: not running")
    return 1
  }

  print("Agent: running (pid \(runtime.processIdentifier))")
  print("Input Monitoring: \(runtime.canListen ? "granted" : "missing")")
  print("Accessibility: \(runtime.canPost ? "granted" : "missing")")
  print("Event tap: \(runtime.eventTapRunning ? "running" : "stopped")")

  return mapping.isFullyApplied
    && runtime.canListen
    && runtime.canPost
    && runtime.eventTapRunning
    ? 0
    : 1
}

private func printUsage() {
  print(
    """
    Usage: CapsLock [--status|--apply-mapping|--remove-mapping|--version]

      (no argument)       Run the Caps Lock agent
      --status            Show mapping and privacy-permission status
      --apply-mapping     Map Caps Lock/Return to left/right Control and exit
      --remove-mapping    Remove the managed Caps Lock mapping and exit
      --version           Print the version
    """
  )
}

let arguments = Array(CommandLine.arguments.dropFirst())
if let command = arguments.first {
  let exitCode: Int32

  switch command {
  case "--status":
    exitCode = printStatus()

  case "--apply-mapping":
    let change = HIDMappingManager().apply()
    print(
      "Caps Lock/Return → Control: \(change.status.applied)/\(change.status.total) keyboards "
        + "(\(change.changed) changed, \(change.status.failed) failed)"
    )
    exitCode = change.status.isFullyApplied ? 0 : 1

  case "--remove-mapping":
    let change = HIDMappingManager().remove()
    print(
      "Removed Caps Lock/Return mappings from \(change.changed) keyboards "
        + "(\(change.status.failed) failed)"
    )
    exitCode = change.status.failed == 0 ? 0 : 1

  case "--version":
    print("CapsLock \(capsLockVersion)")
    exitCode = 0

  case "--help", "-h":
    printUsage()
    exitCode = 0

  default:
    printUsage()
    exitCode = 64
  }

  exit(exitCode)
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
private let delegate = AppDelegate()
application.delegate = delegate
application.run()
