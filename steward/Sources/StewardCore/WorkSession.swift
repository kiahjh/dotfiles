import Foundation

public struct WorkSession: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var startedAt: Date
    public var endedAt: Date?
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        startedAt: Date,
        endedAt: Date?,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public var isActive: Bool {
        endedAt == nil
    }

    public func effectiveEnd(through now: Date) -> Date {
        endedAt ?? now
    }

    public func duration(through now: Date) -> TimeInterval {
        max(0, effectiveEnd(through: now).timeIntervalSince(startedAt))
    }
}

public struct WorkSlice: Equatable, Identifiable, Sendable {
    public var id: String
    public var sessionID: UUID
    public var startedAt: Date
    public var endedAt: Date

    public init(sessionID: UUID, startedAt: Date, endedAt: Date) {
        self.id = "\(sessionID.uuidString)-\(startedAt.timeIntervalSince1970)-\(endedAt.timeIntervalSince1970)"
        self.sessionID = sessionID
        self.startedAt = startedAt
        self.endedAt = endedAt
    }

    public var duration: TimeInterval {
        max(0, endedAt.timeIntervalSince(startedAt))
    }
}

public enum TimeFormatting {
    public static func hoursMinutes(_ interval: TimeInterval) -> String {
        let totalMinutes = Int((abs(interval) / 60).rounded(.toNearestOrAwayFromZero))
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60
        return "\(hours):\(String(format: "%02d", minutes))"
    }

    public static func signedRemaining(worked: TimeInterval, target: TimeInterval) -> String {
        let difference = worked - target

        if abs(difference) < 30 {
            return "0:00"
        }

        if difference > 0 {
            return "+\(hoursMinutes(difference))"
        }

        return "-\(hoursMinutes(difference))"
    }
}
