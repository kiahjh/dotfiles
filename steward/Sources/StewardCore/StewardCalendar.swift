import Foundation

public struct StewardCalendar: Sendable {
    public var calendar: Calendar

    public init(calendar: Calendar = .current) {
        var configured = calendar
        configured.firstWeekday = 2
        self.calendar = configured
    }

    public func startOfDay(for date: Date) -> Date {
        calendar.startOfDay(for: date)
    }

    public func endOfDay(for date: Date) -> Date {
        calendar.date(byAdding: .day, value: 1, to: startOfDay(for: date))!
    }

    public func startOfWeek(containing date: Date) -> Date {
        let day = startOfDay(for: date)
        let weekday = calendar.component(.weekday, from: day)
        let daysSinceWeekStart = (weekday - calendar.firstWeekday + 7) % 7
        return calendar.date(byAdding: .day, value: -daysSinceWeekStart, to: day)!
    }

    public func endOfWeek(containing date: Date) -> Date {
        calendar.date(byAdding: .day, value: 7, to: startOfWeek(containing: date))!
    }

    public func daysInWeek(containing date: Date) -> [Date] {
        let start = startOfWeek(containing: date)
        return (0..<7).compactMap { offset in
            calendar.date(byAdding: .day, value: offset, to: start)
        }
    }

    public func weekStarts(count: Int, endingAt date: Date) -> [Date] {
        guard count > 0 else {
            return []
        }

        let endingWeekStart = startOfWeek(containing: date)
        return (0..<count).compactMap { offset in
            calendar.date(
                byAdding: .day,
                value: (offset - count + 1) * 7,
                to: endingWeekStart
            )
        }
    }

    public func isSameDay(_ lhs: Date, _ rhs: Date) -> Bool {
        calendar.isDate(lhs, inSameDayAs: rhs)
    }

    public func splitSessionsByDay(_ sessions: [WorkSession], from rangeStart: Date, to rangeEnd: Date, now: Date) -> [WorkSlice] {
        sessions.flatMap { session in
            splitSessionByDay(session, from: rangeStart, to: rangeEnd, now: now)
        }
        .sorted { $0.startedAt < $1.startedAt }
    }

    public func splitSessionByDay(_ session: WorkSession, from rangeStart: Date, to rangeEnd: Date, now: Date) -> [WorkSlice] {
        let sessionStart = max(session.startedAt, rangeStart)
        let sessionEnd = min(session.effectiveEnd(through: now), rangeEnd)

        guard sessionEnd > sessionStart else {
            return []
        }

        var slices: [WorkSlice] = []
        var cursor = sessionStart

        while cursor < sessionEnd {
            let nextBoundary = min(endOfDay(for: cursor), sessionEnd)
            slices.append(WorkSlice(sessionID: session.id, startedAt: cursor, endedAt: nextBoundary))
            cursor = nextBoundary
        }

        return slices
    }

    public func totalDuration(_ sessions: [WorkSession], from rangeStart: Date, to rangeEnd: Date, now: Date) -> TimeInterval {
        splitSessionsByDay(sessions, from: rangeStart, to: rangeEnd, now: now)
            .reduce(0) { $0 + $1.duration }
    }

    public func weekdayNumber(for date: Date) -> Int {
        calendar.component(.weekday, from: date)
    }
}
