import Foundation
import Testing
@testable import StewardCore

@Suite("Time tracker")
struct TimeTrackerTests {
    @Test("Start and stop persists a session")
    func startStopPersists() throws {
        let store = InMemoryWorkSessionStore()
        let tracker = try TimeTracker(store: store)
        let start = Date.testDate(2026, 5, 4, 9, 0)
        let end = Date.testDate(2026, 5, 4, 11, 0)

        _ = try tracker.start(at: start)
        _ = try tracker.stop(at: end)

        #expect(store.sessions.count == 1)
        #expect(store.sessions[0].duration(through: end) == .hours(2))
        #expect(tracker.activeSession == nil)
    }

    @Test("Only one active session is allowed")
    func onlyOneActiveSession() throws {
        let tracker = try TimeTracker(store: InMemoryWorkSessionStore())

        _ = try tracker.start(at: Date.testDate(2026, 5, 4, 9, 0))

        #expect(throws: TimeTrackerError.alreadyTracking) {
            try tracker.start(at: Date.testDate(2026, 5, 4, 10, 0))
        }
    }

    @Test("Editing prevents overlaps")
    func editingPreventsOverlaps() throws {
        let firstStart = Date.testDate(2026, 5, 4, 9, 0)
        let first = WorkSession(startedAt: firstStart, endedAt: firstStart.addingTimeInterval(.hours(2)))
        let secondStart = Date.testDate(2026, 5, 4, 13, 0)
        let second = WorkSession(startedAt: secondStart, endedAt: secondStart.addingTimeInterval(.hours(1)))
        let tracker = try TimeTracker(store: InMemoryWorkSessionStore(sessions: [first, second]))

        #expect(throws: TimeTrackerError.overlap) {
            try tracker.updateSession(
                id: second.id,
                startedAt: firstStart.addingTimeInterval(.hours(1)),
                endedAt: firstStart.addingTimeInterval(.hours(3))
            )
        }
    }

    @Test("End before start is rejected")
    func endBeforeStartRejected() throws {
        let start = Date.testDate(2026, 5, 4, 9, 0)
        let session = WorkSession(startedAt: start, endedAt: start.addingTimeInterval(.hours(1)))
        let tracker = try TimeTracker(store: InMemoryWorkSessionStore(sessions: [session]))

        #expect(throws: TimeTrackerError.endBeforeStart) {
            try tracker.updateSession(
                id: session.id,
                startedAt: start,
                endedAt: start.addingTimeInterval(.hours(-1))
            )
        }
    }

    @Test("Idle trim closes pre-gap work and resumes after the gap")
    func idleTrimAndContinue() throws {
        let store = InMemoryWorkSessionStore()
        let tracker = try TimeTracker(store: store)
        let start = Date.testDate(2026, 5, 4, 9, 0)
        let gapStart = Date.testDate(2026, 5, 4, 10, 0)
        let gapEnd = Date.testDate(2026, 5, 4, 10, 30)
        let now = Date.testDate(2026, 5, 4, 10, 31)

        _ = try tracker.start(at: start)
        try tracker.applyIdleGap(IdleGap(startedAt: gapStart, endedAt: gapEnd), resolution: .trimAndContinue, now: now)

        let sessions = tracker.allSessions
        #expect(sessions.count == 2)
        #expect(sessions[0].startedAt == start)
        #expect(sessions[0].endedAt == gapStart)
        #expect(sessions[1].startedAt == gapEnd)
        #expect(sessions[1].endedAt == nil)
    }

    @Test("Idle stop ends active session at the gap start")
    func idleStopAtGapStart() throws {
        let tracker = try TimeTracker(store: InMemoryWorkSessionStore())
        let start = Date.testDate(2026, 5, 4, 9, 0)
        let gapStart = Date.testDate(2026, 5, 4, 10, 0)
        let gapEnd = Date.testDate(2026, 5, 4, 10, 30)

        _ = try tracker.start(at: start)
        try tracker.applyIdleGap(IdleGap(startedAt: gapStart, endedAt: gapEnd), resolution: .stopAtGapStart)

        #expect(tracker.activeSession == nil)
        #expect(tracker.allSessions[0].endedAt == gapStart)
    }
}
