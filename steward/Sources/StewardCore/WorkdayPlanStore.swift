import Foundation

public struct WorkdayPlan: Codable, Equatable, Sendable {
    public static let weekdayNumbers = 1...7
    public static let defaultPlannedWeekdays = [2, 3, 4, 5, 6]
    public static let standard = WorkdayPlan(plannedWeekdays: defaultPlannedWeekdays)

    public var plannedWeekdays: [Int]

    public init(plannedWeekdays: [Int] = Self.defaultPlannedWeekdays) {
        self.plannedWeekdays = Self.normalized(plannedWeekdays)
    }

    public func isPlanned(weekdayNumber: Int) -> Bool {
        plannedWeekdays.contains(weekdayNumber)
    }

    public mutating func setPlanned(_ isPlanned: Bool, weekdayNumber: Int) {
        guard Self.weekdayNumbers.contains(weekdayNumber) else {
            return
        }

        if isPlanned {
            plannedWeekdays = Self.normalized(plannedWeekdays + [weekdayNumber])
        } else {
            plannedWeekdays.removeAll { $0 == weekdayNumber }
        }
    }

    public func withPlanned(_ isPlanned: Bool, weekdayNumber: Int) -> WorkdayPlan {
        var plan = self
        plan.setPlanned(isPlanned, weekdayNumber: weekdayNumber)
        return plan
    }

    public func toggled(weekdayNumber: Int) -> WorkdayPlan {
        withPlanned(!isPlanned(weekdayNumber: weekdayNumber), weekdayNumber: weekdayNumber)
    }

    private static func normalized(_ weekdays: [Int]) -> [Int] {
        Array(Set(weekdays.filter { weekdayNumbers.contains($0) })).sorted()
    }
}

public struct WeeklyWorkdayPlan: Codable, Equatable, Identifiable, Sendable {
    public var weekStart: Date
    public var plan: WorkdayPlan

    public init(weekStart: Date, plan: WorkdayPlan) {
        self.weekStart = weekStart
        self.plan = plan
    }

    public var id: Date {
        weekStart
    }
}

public protocol WorkdayPlanStore: Sendable {
    func loadWorkdayPlans() throws -> [WeeklyWorkdayPlan]
    func saveWorkdayPlans(_ plans: [WeeklyWorkdayPlan]) throws
}

public struct JSONWorkdayPlanStore: WorkdayPlanStore {
    public var fileURL: URL

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    public static func defaultStore(appName: String = "Steward") throws -> JSONWorkdayPlanStore {
        let applicationSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )

        let directory = applicationSupport.appendingPathComponent(appName, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return JSONWorkdayPlanStore(fileURL: directory.appendingPathComponent("workday-plans.json"))
    }

    public func loadWorkdayPlans() throws -> [WeeklyWorkdayPlan] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return []
        }

        let data = try Data(contentsOf: fileURL)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([WeeklyWorkdayPlan].self, from: data)
            .sorted { $0.weekStart < $1.weekStart }
    }

    public func saveWorkdayPlans(_ plans: [WeeklyWorkdayPlan]) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(plans.sorted { $0.weekStart < $1.weekStart })
        try data.write(to: fileURL, options: [.atomic])
    }
}

public final class InMemoryWorkdayPlanStore: WorkdayPlanStore, @unchecked Sendable {
    public private(set) var plans: [WeeklyWorkdayPlan]

    public init(plans: [WeeklyWorkdayPlan] = []) {
        self.plans = plans
    }

    public func loadWorkdayPlans() throws -> [WeeklyWorkdayPlan] {
        plans
    }

    public func saveWorkdayPlans(_ plans: [WeeklyWorkdayPlan]) throws {
        self.plans = plans
    }
}
