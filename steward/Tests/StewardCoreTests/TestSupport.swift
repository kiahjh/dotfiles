import Foundation

extension Calendar {
    static var stewardTest: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        calendar.firstWeekday = 2
        return calendar
    }
}

extension Date {
    static func testDate(_ year: Int, _ month: Int, _ day: Int, _ hour: Int, _ minute: Int) -> Date {
        var components = DateComponents()
        components.calendar = .stewardTest
        components.timeZone = TimeZone(secondsFromGMT: 0)!
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        components.minute = minute
        return components.date!
    }
}

extension TimeInterval {
    static func hours(_ value: Double) -> TimeInterval {
        value * 60 * 60
    }

    static func minutes(_ value: Double) -> TimeInterval {
        value * 60
    }
}
