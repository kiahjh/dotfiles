import Darwin
import Foundation

struct AgentRuntimeStatus: Codable, Equatable {
  let processIdentifier: Int32
  let canListen: Bool
  let canPost: Bool
  let eventTapRunning: Bool
}

enum AgentStatusStore {
  private static var directoryURL: URL {
    FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent("Library/Application Support/CapsLock", isDirectory: true)
  }

  private static var statusURL: URL {
    directoryURL.appendingPathComponent("status.json")
  }

  static func read() -> AgentRuntimeStatus? {
    guard
      let data = try? Data(contentsOf: statusURL),
      let status = try? JSONDecoder().decode(AgentRuntimeStatus.self, from: data),
      kill(status.processIdentifier, 0) == 0
    else {
      return nil
    }
    return status
  }

  static func write(_ status: AgentRuntimeStatus) {
    do {
      try FileManager.default.createDirectory(
        at: directoryURL,
        withIntermediateDirectories: true
      )
      let data = try JSONEncoder().encode(status)
      try data.write(to: statusURL, options: .atomic)
    } catch {
      log("could not write runtime status: \(error)")
    }
  }

  static func remove() {
    try? FileManager.default.removeItem(at: statusURL)
  }
}
