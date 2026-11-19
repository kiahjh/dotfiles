import Foundation
import Testing
@testable import StewardCore

@Suite("Steward calendar")
struct StewardCalendarTests {
    private let calendar = StewardCalendar(calendar: .stewardTest)

    @Test("Calendar is configured for Monday-start weeks")
    func calendarIsConfiguredForMondayStartWeeks() {
        #expect(calendar.calendar.firstWeekday == 2)
    }

    @Test("Weeks run Monday through Sunday")
    func weeksRunMondayThroughSunday() {
        let sunday = Date.testDate(2026, 5, 3, 15, 0)
        let mondayStart = Date.testDate(2026, 4, 27, 0, 0)
        let nextMondayStart = Date.testDate(2026, 5, 4, 0, 0)

        #expect(calendar.startOfWeek(containing: sunday) == mondayStart)
        #expect(calendar.endOfWeek(containing: sunday) == nextMondayStart)

        let days = calendar.daysInWeek(containing: sunday)

        #expect(days.first == mondayStart)
        #expect(days.last == Date.testDate(2026, 5, 3, 0, 0))
    }

    @Test("Week ranges are chronological and end with the selected week")
    func weekRangesEndWithSelectedWeek() {
        let weeks = calendar.weekStarts(
            count: 10,
            endingAt: Date.testDate(2026, 5, 6, 15, 0)
        )

        #expect(weeks.count == 10)
        #expect(weeks.first == Date.testDate(2026, 3, 2, 0, 0))
        #expect(weeks.last == Date.testDate(2026, 5, 4, 0, 0))
        #expect(
            calendar.weekStarts(
                count: 0,
                endingAt: Date.testDate(2026, 5, 6, 15, 0)
            ).isEmpty
        )
    }
}
