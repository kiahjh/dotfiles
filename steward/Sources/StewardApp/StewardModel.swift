import Foundation
import Observation
import StewardCore

@MainActor
@Observable
final class StewardModel {
    @ObservationIgnored private let tracker: TimeTracker
    @ObservationIgnored private let pacing: GoalPacing
    @ObservationIgnored private let weeklyGoalStore: (any WeeklyGoalStore)?
    @ObservationIgnored private let workdayPlanStore: (any WorkdayPlanStore)?
    @ObservationIgnored let stewardCalendar: StewardCalendar

    private(set) var sessions: [WorkSession]
    private(set) var now: Date
    private var weeklyGoals: [Date: TimeInterval]
    private var workdayPlans: [Date: WorkdayPlan]
    var errorMessage: String?
    var pendingIdleGap: IdleGap?
    let storageURL: URL?

    init(
        tracker: TimeTracker,
        storageURL: URL? = nil,
        weeklyGoalStore: (any WeeklyGoalStore)? = nil,
        workdayPlanStore: (any WorkdayPlanStore)? = nil,
        calendar: Calendar = .current
    ) throws {
        let stewardCalendar = StewardCalendar(calendar: calendar)
        self.tracker = tracker
        self.stewardCalendar = stewardCalendar
        self.pacing = GoalPacing(stewardCalendar: stewardCalendar)
        self.weeklyGoalStore = weeklyGoalStore
        self.workdayPlanStore = workdayPlanStore
        self.sessions = tracker.allSessions
        self.now = Date()
        self.weeklyGoals = try Self.loadWeeklyGoals(from: weeklyGoalStore, stewardCalendar: stewardCalendar)
        self.workdayPlans = try Self.loadWorkdayPlans(from: workdayPlanStore, stewardCalendar: stewardCalendar)
        self.storageURL = storageURL
    }

    var isTracking: Bool {
        tracker.activeSession != nil
    }

    var activeSession: WorkSession? {
        tracker.activeSession
    }

    var pacingSnapshot: PacingSnapshot {
        pacing.snapshot(
            for: sessions,
            now: now,
            weeklyGoal: weeklyGoal(containing: now),
            workdayPlan: workdayPlan(containing: now)
        )
    }

    func tick(date: Date = Date()) {
        now = date
        refreshSessions()
    }

    func refreshSessions() {
        let latestSessions = tracker.allSessions
        guard latestSessions != sessions else {
            return
        }

        sessions = latestSessions
    }

    func toggleTracking() {
        isTracking ? stopTracking() : startTracking()
    }

    func startTracking() {
        do {
            _ = try tracker.start(at: now)
            refreshSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func stopTracking() {
        do {
            _ = try tracker.stop(at: now)
            refreshSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func updateSession(id: UUID, startedAt: Date, endedAt: Date?) -> Bool {
        do {
            _ = try tracker.updateSession(id: id, startedAt: startedAt, endedAt: endedAt, updatedAt: now)
            refreshSessions()
            return true
        } catch {
            errorMessage = error.localizedDescription
            refreshSessions()
            return false
        }
    }

    func deleteSession(id: UUID) {
        do {
            try tracker.deleteSession(id: id)
            refreshSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func resolvePendingGap(_ resolution: IdleGapResolution) {
        guard let gap = pendingIdleGap else {
            return
        }

        do {
            try tracker.applyIdleGap(gap, resolution: resolution, now: now)
            pendingIdleGap = nil
            refreshSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func clearError() {
        errorMessage = nil
    }

    func startOfWeek(containing date: Date) -> Date {
        stewardCalendar.startOfWeek(containing: date)
    }

    func daysInWeek(containing date: Date) -> [Date] {
        stewardCalendar.daysInWeek(containing: date)
    }

    func dailyTotal(on date: Date) -> TimeInterval {
        stewardCalendar.totalDuration(
            sessions,
            from: stewardCalendar.startOfDay(for: date),
            to: stewardCalendar.endOfDay(for: date),
            now: now
        )
    }

    func weeklyTotal(containing date: Date) -> TimeInterval {
        stewardCalendar.totalDuration(
            sessions,
            from: stewardCalendar.startOfWeek(containing: date),
            to: stewardCalendar.endOfWeek(containing: date),
            now: now
        )
    }

    func weeklyGoal(containing date: Date) -> TimeInterval {
        weeklyGoals[stewardCalendar.startOfWeek(containing: date)] ?? GoalPacing.defaultWeeklyGoal
    }

    func setWeeklyGoal(_ goal: TimeInterval, containing date: Date) {
        let weekStart = stewardCalendar.startOfWeek(containing: date)
        let normalizedGoal = max(0, goal)
        let previousGoals = weeklyGoals

        if abs(normalizedGoal - GoalPacing.defaultWeeklyGoal) < 30 {
            weeklyGoals.removeValue(forKey: weekStart)
        } else {
            weeklyGoals[weekStart] = normalizedGoal
        }

        do {
            try persistWeeklyGoals()
            NotificationCenter.default.post(name: .stewardPacingConfigurationDidChange, object: self)
        } catch {
            weeklyGoals = previousGoals
            errorMessage = error.localizedDescription
        }
    }

    func workdayPlan(containing date: Date) -> WorkdayPlan {
        workdayPlans[stewardCalendar.startOfWeek(containing: date)] ?? .standard
    }

    func isPlannedWorkday(_ date: Date) -> Bool {
        let dayStart = stewardCalendar.startOfDay(for: date)
        return workdayPlan(containing: dayStart).isPlanned(
            weekdayNumber: stewardCalendar.weekdayNumber(for: dayStart)
        )
    }

    func togglePlannedWorkday(on date: Date) {
        setPlannedWorkday(!isPlannedWorkday(date), on: date)
    }

    func setPlannedWorkday(_ isPlanned: Bool, on date: Date) {
        let dayStart = stewardCalendar.startOfDay(for: date)
        let weekStart = stewardCalendar.startOfWeek(containing: dayStart)
        let weekday = stewardCalendar.weekdayNumber(for: dayStart)
        let previousPlans = workdayPlans
        var plan = workdayPlan(containing: dayStart)
        plan.setPlanned(isPlanned, weekdayNumber: weekday)

        if plan == .standard {
            workdayPlans.removeValue(forKey: weekStart)
        } else {
            workdayPlans[weekStart] = plan
        }

        do {
            try persistWorkdayPlans()
            NotificationCenter.default.post(name: .stewardPacingConfigurationDidChange, object: self)
        } catch {
            workdayPlans = previousPlans
            errorMessage = error.localizedDescription
        }
    }

    func slices(on date: Date) -> [WorkSlice] {
        stewardCalendar.splitSessionsByDay(
            sessions,
            from: stewardCalendar.startOfDay(for: date),
            to: stewardCalendar.endOfDay(for: date),
            now: now
        )
    }

    func sessions(inWeekContaining date: Date) -> [WorkSession] {
        let start = stewardCalendar.startOfWeek(containing: date)
        let end = stewardCalendar.endOfWeek(containing: date)

        return sessions.filter { session in
            session.startedAt < end && session.effectiveEnd(through: now) > start
        }
        .sorted { $0.startedAt < $1.startedAt }
    }

    private static func loadWeeklyGoals(
        from store: (any WeeklyGoalStore)?,
        stewardCalendar: StewardCalendar
    ) throws -> [Date: TimeInterval] {
        guard let store else {
            return [:]
        }

        return try store.loadWeeklyGoals().reduce(into: [:]) { goals, goal in
            let weekStart = stewardCalendar.startOfWeek(containing: goal.weekStart)
            goals[weekStart] = max(0, goal.target)
        }
    }

    private static func loadWorkdayPlans(
        from store: (any WorkdayPlanStore)?,
        stewardCalendar: StewardCalendar
    ) throws -> [Date: WorkdayPlan] {
        guard let store else {
            return [:]
        }

        return try store.loadWorkdayPlans().reduce(into: [:]) { plans, weeklyPlan in
            let weekStart = stewardCalendar.startOfWeek(containing: weeklyPlan.weekStart)
            let plan = weeklyPlan.plan

            if plan == .standard {
                plans.removeValue(forKey: weekStart)
            } else {
                plans[weekStart] = plan
            }
        }
    }

    private func persistWeeklyGoals() throws {
        guard let weeklyGoalStore else {
            return
        }

        let goals = weeklyGoals.map { weekStart, target in
            WeeklyGoal(weekStart: weekStart, target: target)
        }
        .sorted { $0.weekStart < $1.weekStart }

        try weeklyGoalStore.saveWeeklyGoals(goals)
    }

    private func persistWorkdayPlans() throws {
        guard let workdayPlanStore else {
            return
        }

        let plans = workdayPlans.map { weekStart, plan in
            WeeklyWorkdayPlan(weekStart: weekStart, plan: plan)
        }
        .sorted { $0.weekStart < $1.weekStart }

        try workdayPlanStore.saveWorkdayPlans(plans)
    }
}

extension Notification.Name {
    static let stewardPacingConfigurationDidChange = Notification.Name("stewardPacingConfigurationDidChange")
}
