import Foundation

public struct WeeklyGoal: Codable, Equatable, Identifiable, Sendable {
    public var weekStart: Date
    public var target: TimeInterval

    public init(weekStart: Date, target: TimeInterval) {
        self.weekStart = weekStart
        self.target = max(0, target)
    }

    public var id: Date {
        weekStart
    }
}

public protocol WeeklyGoalStore: Sendable {
    func loadWeeklyGoals() throws -> [WeeklyGoal]
    func saveWeeklyGoals(_ goals: [WeeklyGoal]) throws
}

public struct JSONWeeklyGoalStore: WeeklyGoalStore {
    public var fileURL: URL

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    public static func defaultStore(appName: String = "Steward") throws -> JSONWeeklyGoalStore {
        let applicationSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )

        let directory = applicationSupport.appendingPathComponent(appName, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return JSONWeeklyGoalStore(fileURL: directory.appendingPathComponent("weekly-goals.json"))
    }

    public func loadWeeklyGoals() throws -> [WeeklyGoal] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return []
        }

        let data = try Data(contentsOf: fileURL)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([WeeklyGoal].self, from: data)
            .sorted { $0.weekStart < $1.weekStart }
    }

    public func saveWeeklyGoals(_ goals: [WeeklyGoal]) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(goals.sorted { $0.weekStart < $1.weekStart })
        try data.write(to: fileURL, options: [.atomic])
    }
}

public final class InMemoryWeeklyGoalStore: WeeklyGoalStore, @unchecked Sendable {
    public private(set) var goals: [WeeklyGoal]

    public init(goals: [WeeklyGoal] = []) {
        self.goals = goals
    }

    public func loadWeeklyGoals() throws -> [WeeklyGoal] {
        goals
    }

    public func saveWeeklyGoals(_ goals: [WeeklyGoal]) throws {
        self.goals = goals
    }
}
