import AppKit
import Foundation
import StewardCore

@MainActor
final class IdleMonitor {
    private let threshold: TimeInterval
    private let isTracking: () -> Bool
    private let onGapDetected: (IdleGap) -> Void

    private var timer: Timer?
    private var idleStartedAt: Date?
    private var sleepStartedAt: Date?

    init(threshold: TimeInterval, isTracking: @escaping () -> Bool, onGapDetected: @escaping (IdleGap) -> Void) {
        self.threshold = threshold
        self.isTracking = isTracking
        self.onGapDetected = onGapDetected
    }

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.pollIdleState()
            }
        }

        if let timer {
            RunLoop.main.add(timer, forMode: .common)
        }

        NSWorkspace.shared.notificationCenter.addObserver(
            self,
            selector: #selector(workspaceWillSleep),
            name: NSWorkspace.willSleepNotification,
            object: nil
        )

        NSWorkspace.shared.notificationCenter.addObserver(
            self,
            selector: #selector(workspaceDidWake),
            name: NSWorkspace.didWakeNotification,
            object: nil
        )
    }

    func stop() {
        timer?.invalidate()
        NSWorkspace.shared.notificationCenter.removeObserver(self)
    }

    private func pollIdleState() {
        guard isTracking() else {
            idleStartedAt = nil
            return
        }

        let now = Date()
        let idleSeconds = CGEventSource.secondsSinceLastEventType(
            .combinedSessionState,
            eventType: CGEventType(rawValue: UInt32.max)!
        )

        if idleSeconds >= threshold {
            if idleStartedAt == nil {
                idleStartedAt = now.addingTimeInterval(-idleSeconds)
            }
            return
        }

        if let idleStartedAt {
            let gap = IdleGap(startedAt: idleStartedAt, endedAt: now)
            self.idleStartedAt = nil
            onGapDetected(gap)
        }
    }

    @objc private func workspaceWillSleep() {
        guard isTracking() else {
            return
        }

        sleepStartedAt = Date()
    }

    @objc private func workspaceDidWake() {
        guard let sleepStartedAt else {
            return
        }

        let now = Date()
        self.sleepStartedAt = nil

        guard isTracking(), now.timeIntervalSince(sleepStartedAt) >= threshold else {
            return
        }

        onGapDetected(IdleGap(startedAt: sleepStartedAt, endedAt: now))
    }
}
