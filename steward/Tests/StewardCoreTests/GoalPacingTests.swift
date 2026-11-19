import Foundation
import Testing
@testable import StewardCore

@Suite("Goal pacing")
struct GoalPacingTests {
    private let calendar = StewardCalendar(calendar: .stewardTest)

    @Test("Sunday work does not reduce the following Monday target")
    func sundayWorkDoesNotReduceFollowingMondayTarget() {
        let sunday = Date.testDate(2026, 5, 3, 9, 0)
        let monday = Date.testDate(2026, 5, 4, 8, 0)
        let sessions = [
            WorkSession(startedAt: sunday, endedAt: sunday.addingTimeInterval(.hours(4)))
        ]

        let pacing = GoalPacing(stewardCalendar: calendar)
        let target = pacing.targetForDay(containing: monday, sessions: sessions, now: monday)

        #expect(target == .hours(8))
    }

    @Test("Weekday overage lowers the next weekday target")
    func weekdayOverageLowersNextTarget() {
        let monday = Date.testDate(2026, 5, 4, 8, 0)
        let tuesday = Date.testDate(2026, 5, 5, 8, 0)
        let sessions = [
            WorkSession(startedAt: monday, endedAt: monday.addingTimeInterval(.hours(10)))
        ]

        let pacing = GoalPacing(stewardCalendar: calendar)
        let target = pacing.targetForDay(containing: tuesday, sessions: sessions, now: tuesday)

        #expect(target == .hours(7) + .minutes(30))
    }

    @Test("Today target stays based on work before today")
    func targetUsesWorkBeforeTodayOnly() {
        let monday = Date.testDate(2026, 5, 4, 8, 0)
        let noonMonday = Date.testDate(2026, 5, 4, 12, 0)
        let sessions = [
            WorkSession(startedAt: monday, endedAt: noonMonday)
        ]

        let pacing = GoalPacing(stewardCalendar: calendar)
        let target = pacing.targetForDay(containing: noonMonday, sessions: sessions, now: noonMonday)

        #expect(target == .hours(8))
    }

    @Test("Historical day target uses work before that day")
    func historicalTargetUsesWorkBeforeThatDay() {
        let monday = Date.testDate(2026, 5, 4, 9, 0)
        let tuesday = Date.testDate(2026, 5, 5, 9, 0)
        let wednesday = Date.testDate(2026, 5, 6, 9, 0)
        let thursday = Date.testDate(2026, 5, 7, 9, 0)
        let friday = Date.testDate(2026, 5, 8, 9, 0)
        let saturday = Date.testDate(2026, 5, 9, 9, 0)
        let sessions = [
            WorkSession(startedAt: monday, endedAt: monday.addingTimeInterval(.hours(6))),
            WorkSession(startedAt: tuesday, endedAt: tuesday.addingTimeInterval(.hours(10))),
            WorkSession(startedAt: wednesday, endedAt: wednesday.addingTimeInterval(.hours(8))),
            WorkSession(startedAt: thursday, endedAt: thursday.addingTimeInterval(.hours(7)))
        ]

        let pacing = GoalPacing(stewardCalendar: calendar)
        let tuesdayTarget = pacing.targetForDay(containing: tuesday, sessions: sessions, now: saturday)
        let fridayTarget = pacing.targetForDay(containing: friday, sessions: sessions, now: saturday)

        #expect(tuesdayTarget == .hours(8) + .minutes(30))
        #expect(fridayTarget == .hours(9))
    }

    @Test("Projected targets before the first planned day stay evenly paced")
    func projectedTargetsBeforeFirstPlannedDayStayEvenlyPaced() {
        let monday = Date.testDate(2026, 5, 4, 12, 0)
        let tuesday = Date.testDate(2026, 5, 5, 9, 0)
        let friday = Date.testDate(2026, 5, 8, 9, 0)
        let plan = WorkdayPlan(plannedWeekdays: [3, 4, 5, 6])

        let pacing = GoalPacing(stewardCalendar: calendar)
        let tuesdayTarget = pacing.projectedTargetForDay(containing: tuesday, sessions: [], now: monday, workdayPlan: plan)
        let fridayTarget = pacing.projectedTargetForDay(containing: friday, sessions: [], now: monday, workdayPlan: plan)

        #expect(tuesdayTarget == .hours(10))
        #expect(fridayTarget == .hours(10))
    }

    @Test("Projected targets keep today's target but spread today's shortfall across future days")
    func projectedTargetsUseTodayActualWorkOnly() {
        let monday = Date.testDate(2026, 5, 4, 9, 0)
        let tuesday = Date.testDate(2026, 5, 5, 9, 0)
        let friday = Date.testDate(2026, 5, 8, 9, 0)

        let pacing = GoalPacing(stewardCalendar: calendar)
        let mondayTarget = pacing.projectedTargetForDay(containing: monday, sessions: [], now: monday)
        let tuesdayTarget = pacing.projectedTargetForDay(containing: tuesday, sessions: [], now: monday)
        let fridayTarget = pacing.projectedTargetForDay(containing: friday, sessions: [], now: monday)

        #expect(mondayTarget == .hours(8))
        #expect(tuesdayTarget == .hours(10))
        #expect(fridayTarget == .hours(10))
    }

    @Test("Projected future targets subtract work completed today")
    func projectedFutureTargetsSubtractWorkCompletedToday() {
        let monday = Date.testDate(2026, 5, 4, 9, 0)
        let now = monday.addingTimeInterval(.minutes(26))
        let tuesday = Date.testDate(2026, 5, 5, 9, 0)
        let friday = Date.testDate(2026, 5, 8, 9, 0)
        let sessions = [
            WorkSession(startedAt: monday, endedAt: now)
        ]
        let expected: TimeInterval = (.hours(40) - .minutes(26)) / 4

        let pacing = GoalPacing(stewardCalendar: calendar)
        let tuesdayTarget = pacing.projectedTargetForDay(containing: tuesday, sessions: sessions, now: now)
        let fridayTarget = pacing.projectedTargetForDay(containing: friday, sessions: sessions, now: now)

        #expect(tuesdayTarget == expected)
        #expect(fridayTarget == expected)
    }

    @Test("Projected current week targets use today's actual before assuming future days are met")
    func projectedCurrentWeekTargetsUseTodayActualBeforeFutureDaysAreMet() {
        let monday = Date.testDate(2026, 5, 4, 9, 0)
        let tuesday = Date.testDate(2026, 5, 5, 9, 0)
        let wednesday = Date.testDate(2026, 5, 6, 12, 0)
        let thursday = Date.testDate(2026, 5, 7, 9, 0)
        let friday = Date.testDate(2026, 5, 8, 9, 0)
        let sessions = [
            WorkSession(startedAt: monday, endedAt: monday.addingTimeInterval(.hours(6))),
            WorkSession(startedAt: tuesday, endedAt: tuesday.addingTimeInterval(.hours(10)))
        ]

        let pacing = GoalPacing(stewardCalendar: calendar)
        let thursdayTarget = pacing.projectedTargetForDay(containing: thursday, sessions: sessions, now: wednesday)
        let fridayTarget = pacing.projectedTargetForDay(containing: friday, sessions: sessions, now: wednesday)

        #expect(thursdayTarget == .hours(12))
        #expect(fridayTarget == .hours(12))
    }

    @Test("Custom weekly goal drives weekly and daily pacing")
    func customWeeklyGoal() {
        let monday = Date.testDate(2026, 5, 4, 8, 0)
        let pacing = GoalPacing(stewardCalendar: calendar)
        let snapshot = pacing.snapshot(for: [], now: monday, weeklyGoal: .hours(35))

        #expect(snapshot.weekly.target == .hours(35))
        #expect(snapshot.daily.target == .hours(7))
    }

    @Test("Unselected weekday has no target")
    func unselectedWeekdayHasNoTarget() {
        let wednesday = Date.testDate(2026, 5, 6, 9, 0)
        let plan = WorkdayPlan(plannedWeekdays: [2, 3, 5, 6])
        let pacing = GoalPacing(stewardCalendar: calendar)
        let target = pacing.targetForDay(containing: wednesday, sessions: [], now: wednesday, workdayPlan: plan)

        #expect(target == 0)
    }

    @Test("Skipping Wednesday spreads the weekly goal over four planned weekdays")
    func skippingWeekdaySpreadsGoalOverRemainingPlannedDays() {
        let monday = Date.testDate(2026, 5, 4, 9, 0)
        let plan = WorkdayPlan(plannedWeekdays: [2, 3, 5, 6])
        let pacing = GoalPacing(stewardCalendar: calendar)
        let target = pacing.targetForDay(containing: monday, sessions: [], now: monday, workdayPlan: plan)

        #expect(target == .hours(10))
    }

    @Test("Selecting Saturday spreads the weekly goal over six planned days")
    func selectingSaturdaySpreadsGoalOverSixDays() {
        let monday = Date.testDate(2026, 5, 4, 9, 0)
        let plan = WorkdayPlan(plannedWeekdays: [2, 3, 4, 5, 6, 7])
        let pacing = GoalPacing(stewardCalendar: calendar)
        let target = pacing.targetForDay(containing: monday, sessions: [], now: monday, workdayPlan: plan)

        #expect(target == .hours(6) + .minutes(40))
    }

    @Test("Saturday has no target unless selected")
    func saturdayHasNoTargetUnlessSelected() {
        let monday = Date.testDate(2026, 5, 4, 9, 0)
        let tuesday = Date.testDate(2026, 5, 5, 9, 0)
        let wednesday = Date.testDate(2026, 5, 6, 9, 0)
        let thursday = Date.testDate(2026, 5, 7, 9, 0)
        let friday = Date.testDate(2026, 5, 8, 9, 0)
        let saturday = Date.testDate(2026, 5, 9, 9, 0)
        let starts = [monday, tuesday, wednesday, thursday, friday]
        let sessions = starts.map { start in
            WorkSession(startedAt: start, endedAt: start.addingTimeInterval(.hours(7)))
        }

        let pacing = GoalPacing(stewardCalendar: calendar)
        let defaultTarget = pacing.targetForDay(containing: saturday, sessions: sessions, now: saturday)
        let selectedTarget = pacing.targetForDay(
            containing: saturday,
            sessions: sessions,
            now: saturday,
            workdayPlan: WorkdayPlan(plannedWeekdays: [2, 3, 4, 5, 6, 7])
        )

        #expect(defaultTarget == 0)
        #expect(selectedTarget == .hours(5))
    }

    @Test("Weekly snapshot splits sessions crossing midnight")
    func weeklySnapshotSplitsMidnight() {
        let lateMonday = Date.testDate(2026, 5, 4, 23, 0)
        let earlyTuesday = Date.testDate(2026, 5, 5, 1, 0)
        let sessions = [
            WorkSession(startedAt: lateMonday, endedAt: earlyTuesday)
        ]

        let pacing = GoalPacing(stewardCalendar: calendar)
        let snapshot = pacing.snapshot(for: sessions, now: earlyTuesday)

        #expect(snapshot.daily.worked == .hours(1))
        #expect(snapshot.weekly.worked == .hours(2))
    }

    @Test("Progress labels show surplus")
    func surplusLabels() {
        let line = ProgressLine(worked: .hours(9) + .minutes(30), target: .hours(8))

        #expect(line.workedLabel == "9:30")
        #expect(line.remainingLabel == "+1:30")
        #expect(line.asciiBar(width: 4) == "[||||]")
    }
}
