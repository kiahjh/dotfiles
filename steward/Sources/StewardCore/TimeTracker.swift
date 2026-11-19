import Foundation

public enum TimeTrackerError: LocalizedError, Equatable {
    case alreadyTracking
    case notTracking
    case sessionNotFound
    case endBeforeStart
    case overlap

    public var errorDescription: String? {
        switch self {
        case .alreadyTracking:
            return "Steward is already tracking."
        case .notTracking:
            return "Steward is not tracking."
        case .sessionNotFound:
            return "That work session could not be found."
        case .endBeforeStart:
            return "The end time must be after the start time."
        case .overlap:
            return "Work sessions cannot overlap."
        }
    }
}

public struct IdleGap: Equatable, Identifiable, Sendable {
    public var id: UUID
    public var startedAt: Date
    public var endedAt: Date

    public init(id: UUID = UUID(), startedAt: Date, endedAt: Date) {
        self.id = id
        self.startedAt = startedAt
        self.endedAt = endedAt
    }
}

public enum IdleGapResolution: Sendable {
    case keep
    case trimAndContinue
    case stopAtGapStart
}

public final class TimeTracker: @unchecked Sendable {
    private var sessions: [WorkSession]
    private let store: any WorkSessionStore

    public init(store: any WorkSessionStore) throws {
        self.store = store
        self.sessions = try store.loadSessions().sorted { $0.startedAt < $1.startedAt }
        try validateAll(sessions)
    }

    public var allSessions: [WorkSession] {
        sessions.sorted { $0.startedAt < $1.startedAt }
    }

    public var activeSession: WorkSession? {
        sessions.first { $0.isActive }
    }

    @discardableResult
    public func start(at date: Date = Date()) throws -> WorkSession {
        guard activeSession == nil else {
            throw TimeTrackerError.alreadyTracking
        }

        let session = WorkSession(startedAt: date, endedAt: nil, createdAt: date, updatedAt: date)
        try validateCandidate(session, excluding: nil, in: sessions)
        sessions.append(session)
        try persist()
        return session
    }

    @discardableResult
    public func stop(at date: Date = Date()) throws -> WorkSession {
        guard let active = activeSession, let index = sessions.firstIndex(where: { $0.id == active.id }) else {
            throw TimeTrackerError.notTracking
        }

        guard date >= active.startedAt else {
            throw TimeTrackerError.endBeforeStart
        }

        var stopped = active
        stopped.endedAt = date
        stopped.updatedAt = date
        try validateCandidate(stopped, excluding: stopped.id, in: sessions)
        sessions[index] = stopped
        try persist()
        return stopped
    }

    @discardableResult
    public func updateSession(id: UUID, startedAt: Date, endedAt: Date?, updatedAt: Date = Date()) throws -> WorkSession {
        guard let index = sessions.firstIndex(where: { $0.id == id }) else {
            throw TimeTrackerError.sessionNotFound
        }

        if let endedAt, endedAt < startedAt {
            throw TimeTrackerError.endBeforeStart
        }

        var updated = sessions[index]
        updated.startedAt = startedAt
        updated.endedAt = endedAt
        updated.updatedAt = updatedAt
        try validateCandidate(updated, excluding: id, in: sessions)
        sessions[index] = updated
        try persist()
        return updated
    }

    public func deleteSession(id: UUID) throws {
        guard let index = sessions.firstIndex(where: { $0.id == id }) else {
            throw TimeTrackerError.sessionNotFound
        }

        sessions.remove(at: index)
        try persist()
    }

    public func applyIdleGap(_ gap: IdleGap, resolution: IdleGapResolution, now: Date = Date()) throws {
        switch resolution {
        case .keep:
            return
        case .trimAndContinue:
            try trimAndContinue(gap, now: now)
        case .stopAtGapStart:
            try stopAtGapStart(gap)
        }
    }

    private func trimAndContinue(_ gap: IdleGap, now: Date) throws {
        guard let active = activeSession, let index = sessions.firstIndex(where: { $0.id == active.id }) else {
            throw TimeTrackerError.notTracking
        }

        let trimStart = max(active.startedAt, gap.startedAt)
        let resumeAt = min(max(gap.endedAt, trimStart), now)

        guard trimStart > active.startedAt else {
            sessions.remove(at: index)
            if resumeAt < now || resumeAt == gap.endedAt {
                let resumed = WorkSession(startedAt: resumeAt, endedAt: nil, createdAt: now, updatedAt: now)
                try validateCandidate(resumed, excluding: nil, in: sessions)
                sessions.append(resumed)
            }
            try persist()
            return
        }

        var beforeGap = active
        beforeGap.endedAt = trimStart
        beforeGap.updatedAt = now
        sessions[index] = beforeGap

        let resumed = WorkSession(startedAt: resumeAt, endedAt: nil, createdAt: now, updatedAt: now)
        try validateCandidate(resumed, excluding: nil, in: sessions)
        sessions.append(resumed)
        try persist()
    }

    private func stopAtGapStart(_ gap: IdleGap) throws {
        guard let active = activeSession else {
            throw TimeTrackerError.notTracking
        }

        let stopDate = max(active.startedAt, gap.startedAt)
        _ = try stop(at: stopDate)
    }

    private func persist() throws {
        sessions = sessions.sorted { $0.startedAt < $1.startedAt }
        try validateAll(sessions)
        try store.saveSessions(sessions)
    }
}

private func validateAll(_ sessions: [WorkSession]) throws {
    let activeCount = sessions.filter(\.isActive).count
    if activeCount > 1 {
        throw TimeTrackerError.alreadyTracking
    }

    for session in sessions {
        try validateCandidate(session, excluding: session.id, in: sessions)
    }
}

private func validateCandidate(_ candidate: WorkSession, excluding excludedID: UUID?, in sessions: [WorkSession]) throws {
    if let endedAt = candidate.endedAt, endedAt < candidate.startedAt {
        throw TimeTrackerError.endBeforeStart
    }

    let candidateEnd = candidate.endedAt ?? .distantFuture

    for session in sessions where session.id != excludedID {
        let sessionEnd = session.endedAt ?? .distantFuture
        if candidate.startedAt < sessionEnd && session.startedAt < candidateEnd {
            throw TimeTrackerError.overlap
        }
    }
}
