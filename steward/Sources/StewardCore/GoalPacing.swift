import Foundation

public struct ProgressLine: Equatable, Sendable {
    public var worked: TimeInterval
    public var target: TimeInterval

    public init(worked: TimeInterval, target: TimeInterval) {
        self.worked = max(0, worked)
        self.target = max(0, target)
    }

    public var fraction: Double {
        guard target > 0 else {
            return worked > 0 ? 1 : 0
        }

        return min(1, worked / target)
    }

    public var workedLabel: String {
        TimeFormatting.hoursMinutes(worked)
    }

    public var remainingLabel: String {
        TimeFormatting.signedRemaining(worked: worked, target: target)
    }

    public func asciiBar(width: Int = 16) -> String {
        let clampedWidth = max(1, width)
        let filled = Int((fraction * Double(clampedWidth)).rounded(.down))
        let empty = clampedWidth - filled
        return "[\(String(repeating: "|", count: filled))\(String(repeating: "-", count: empty))]"
    }

    public func statusText(barWidth: Int = 16) -> String {
        "\(workedLabel) \(asciiBar(width: barWidth)) \(remainingLabel)"
    }
}

public struct PacingSnapshot: Equatable, Sendable {
    public var daily: ProgressLine
    public var weekly: ProgressLine
    public var weekStart: Date
    public var todayStart: Date

    public init(daily: ProgressLine, weekly: ProgressLine, weekStart: Date, todayStart: Date) {
        self.daily = daily
        self.weekly = weekly
        self.weekStart = weekStart
        self.todayStart = todayStart
    }
}

public struct GoalPacing: Sendable {
    public static let defaultWeeklyGoal: TimeInterval = 40 * 60 * 60

    public var weeklyGoal: TimeInterval
    public var stewardCalendar: StewardCalendar

    public init(weeklyGoal: TimeInterval = Self.defaultWeeklyGoal, stewardCalendar: StewardCalendar = StewardCalendar()) {
        self.weeklyGoal = weeklyGoal
        self.stewardCalendar = stewardCalendar
    }

    public func snapshot(
        for sessions: [WorkSession],
        now: Date,
        weeklyGoal weeklyGoalOverride: TimeInterval? = nil,
        workdayPlan: WorkdayPlan = .standard
    ) -> PacingSnapshot {
        let weeklyGoal = max(0, weeklyGoalOverride ?? self.weeklyGoal)
        let todayStart = stewardCalendar.startOfDay(for: now)
        let weekStart = stewardCalendar.startOfWeek(containing: now)
        let weekEnd = stewardCalendar.endOfWeek(containing: now)
        let dayEnd = stewardCalendar.endOfDay(for: now)

        let dailyWorked = stewardCalendar.totalDuration(sessions, from: todayStart, to: min(dayEnd, now), now: now)
        let weeklyWorked = stewardCalendar.totalDuration(sessions, from: weekStart, to: min(weekEnd, now), now: now)
        let dailyTarget = targetForDay(
            containing: now,
            sessions: sessions,
            now: now,
            weeklyGoal: weeklyGoal,
            workdayPlan: workdayPlan
        )

        return PacingSnapshot(
            daily: ProgressLine(worked: dailyWorked, target: dailyTarget),
            weekly: ProgressLine(worked: weeklyWorked, target: weeklyGoal),
            weekStart: weekStart,
            todayStart: todayStart
        )
    }

    public func targetForDay(
        containing date: Date,
        sessions: [WorkSession],
        now: Date,
        weeklyGoal weeklyGoalOverride: TimeInterval? = nil,
        workdayPlan: WorkdayPlan = .standard
    ) -> TimeInterval {
        let weeklyGoal = max(0, weeklyGoalOverride ?? self.weeklyGoal)
        let dayStart = stewardCalendar.startOfDay(for: date)
        let weekStart = stewardCalendar.startOfWeek(containing: date)
        let weekday = stewardCalendar.weekdayNumber(for: dayStart)

        guard workdayPlan.isPlanned(weekdayNumber: weekday) else {
            return 0
        }

        let workedBeforeDay = stewardCalendar.totalDuration(sessions, from: weekStart, to: dayStart, now: now)
        let remainingAtStartOfDay = max(0, weeklyGoal - workedBeforeDay)
        let remainingPlannedDays = stewardCalendar.daysInWeek(containing: date)
            .filter { day in
                day >= dayStart && workdayPlan.isPlanned(weekdayNumber: stewardCalendar.weekdayNumber(for: day))
            }
            .count

        guard remainingPlannedDays > 0 else {
            return 0
        }

        return remainingAtStartOfDay / Double(remainingPlannedDays)
    }

    public func projectedTargetForDay(
        containing date: Date,
        sessions: [WorkSession],
        now: Date,
        weeklyGoal weeklyGoalOverride: TimeInterval? = nil,
        workdayPlan: WorkdayPlan = .standard
    ) -> TimeInterval {
        let dayStart = stewardCalendar.startOfDay(for: date)
        let todayStart = stewardCalendar.startOfDay(for: now)

        guard dayStart > todayStart else {
            return targetForDay(
                containing: date,
                sessions: sessions,
                now: now,
                weeklyGoal: weeklyGoalOverride,
                workdayPlan: workdayPlan
            )
        }

        let weeklyGoal = max(0, weeklyGoalOverride ?? self.weeklyGoal)
        let days = stewardCalendar.daysInWeek(containing: date)
        let weekday = stewardCalendar.weekdayNumber(for: dayStart)

        guard workdayPlan.isPlanned(weekdayNumber: weekday) else {
            return 0
        }

        var remaining = weeklyGoal

        for day in days where day < dayStart {
            let actual = stewardCalendar.totalDuration(
                sessions,
                from: day,
                to: stewardCalendar.endOfDay(for: day),
                now: now
            )

            if day <= todayStart {
                remaining = max(0, remaining - actual)
                continue
            }

            guard workdayPlan.isPlanned(weekdayNumber: stewardCalendar.weekdayNumber(for: day)) else {
                remaining = max(0, remaining - actual)
                continue
            }

            let remainingPlannedDays = days
                .filter { candidate in
                    candidate >= day && workdayPlan.isPlanned(
                        weekdayNumber: stewardCalendar.weekdayNumber(for: candidate)
                    )
                }
                .count

            guard remainingPlannedDays > 0 else {
                continue
            }

            let projectedTarget = remaining / Double(remainingPlannedDays)
            remaining = max(0, remaining - max(actual, projectedTarget))
        }

        let remainingPlannedDays = days
            .filter { day in
                day >= dayStart && workdayPlan.isPlanned(
                    weekdayNumber: stewardCalendar.weekdayNumber(for: day)
                )
            }
            .count

        guard remainingPlannedDays > 0 else {
            return 0
        }

        return remaining / Double(remainingPlannedDays)
    }
}
