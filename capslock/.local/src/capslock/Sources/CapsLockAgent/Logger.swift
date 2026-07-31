import Foundation

func log(_ message: String) {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  let timestamp = formatter.string(from: Date())
  FileHandle.standardError.write(Data("[\(timestamp)] \(message)\n".utf8))
}
