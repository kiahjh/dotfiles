import AppKit
import Foundation

private let soloVersion = "0.1.0"

private final class AppDelegate: NSObject, NSApplicationDelegate {
  private var controller: SoloController?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let gap = gapPoints()
    log("starting Solo \(soloVersion) with a \(Int(gap))pt gap")
    let controller = SoloController(gap: gap)
    self.controller = controller
    controller.start()
  }

  private func gapPoints() -> CGFloat {
    let requested = ProcessInfo.processInfo.environment["SOLO_GAP"].flatMap(Double.init) ?? 24
    return CGFloat(min(max(requested, 0), 200))
  }
}

let arguments = Array(CommandLine.arguments.dropFirst())
if let command = arguments.first {
  switch command {
  case "--version":
    print("Solo \(soloVersion)")
    exit(0)
  default:
    print("Usage: Solo [--version]\n\n  (no argument)  Run the Solo agent")
    exit(command == "--help" || command == "-h" ? 0 : 64)
  }
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
private let delegate = AppDelegate()
application.delegate = delegate
application.run()
