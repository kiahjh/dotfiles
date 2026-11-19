import Foundation

public protocol WorkSessionStore: Sendable {
    func loadSessions() throws -> [WorkSession]
    func saveSessions(_ sessions: [WorkSession]) throws
}

public struct JSONWorkSessionStore: WorkSessionStore {
    public var fileURL: URL

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    public static func defaultStore(appName: String = "Steward") throws -> JSONWorkSessionStore {
        let applicationSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )

        let directory = applicationSupport.appendingPathComponent(appName, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return JSONWorkSessionStore(fileURL: directory.appendingPathComponent("work-sessions.json"))
    }

    public func loadSessions() throws -> [WorkSession] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return []
        }

        let data = try Data(contentsOf: fileURL)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([WorkSession].self, from: data)
            .sorted { $0.startedAt < $1.startedAt }
    }

    public func saveSessions(_ sessions: [WorkSession]) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(sessions.sorted { $0.startedAt < $1.startedAt })
        try data.write(to: fileURL, options: [.atomic])
    }
}

public final class InMemoryWorkSessionStore: WorkSessionStore, @unchecked Sendable {
    public private(set) var sessions: [WorkSession]

    public init(sessions: [WorkSession] = []) {
        self.sessions = sessions
    }

    public func loadSessions() throws -> [WorkSession] {
        sessions
    }

    public func saveSessions(_ sessions: [WorkSession]) throws {
        self.sessions = sessions
    }
}
