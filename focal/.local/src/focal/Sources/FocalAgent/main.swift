import AppKit
import Foundation

private let focalVersion = "0.1.0"

private final class AppDelegate: NSObject, NSApplicationDelegate {
  private var controller: FocalController?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let gap = gapPoints()
    let parking = parkedApps()
    log("starting Focal \(focalVersion) with a \(Int(gap))pt gap, parking \(parking.sorted())")
    let controller = FocalController(gap: gap, parking: parking)
    self.controller = controller
    controller.start()
  }

  private func gapPoints() -> CGFloat {
    let requested = ProcessInfo.processInfo.environment["FOCAL_GAP"].flatMap(Double.init) ?? 24
    return CGFloat(min(max(requested, 0), 200))
  }

  /// FOCAL_PARK: comma-separated bundle IDs.
  private func parkedApps() -> Set<String> {
    let list = ProcessInfo.processInfo.environment["FOCAL_PARK"] ?? ""
    return Set(
      list.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter {
        !$0.isEmpty
      })
  }
}

let arguments = Array(CommandLine.arguments.dropFirst())
if let command = arguments.first {
  switch command {
  case "--version":
    print("Focal \(focalVersion)")
    exit(0)
  default:
    print("Usage: Focal [--version]\n\n  (no argument)  Run the Focal agent")
    exit(command == "--help" || command == "-h" ? 0 : 64)
  }
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
private let delegate = AppDelegate()
application.delegate = delegate
application.run()
