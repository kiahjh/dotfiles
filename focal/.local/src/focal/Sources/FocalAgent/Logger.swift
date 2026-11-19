import Foundation

private let debugging = ProcessInfo.processInfo.environment["FOCAL_DEBUG"] == "1"

func log(_ message: String) {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  let timestamp = formatter.string(from: Date())
  FileHandle.standardError.write(Data("[\(timestamp)] \(message)\n".utf8))
}

/// Logs only when FOCAL_DEBUG=1, since these happen on every app switch.
func debug(_ message: @autoclosure () -> String) {
  if debugging { log(message()) }
}
