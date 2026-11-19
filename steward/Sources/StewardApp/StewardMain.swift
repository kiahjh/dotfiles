import AppKit
import Foundation
import StewardCore

@main
enum StewardExecutable {
    static func main() {
        let app = NSApplication.shared
        let delegate = StewardAppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
        _ = delegate
    }
}

@MainActor
final class StewardAppDelegate: NSObject, NSApplicationDelegate {
    private var model: StewardModel?
    private var statusBarController: StatusBarController?
    private var historyWindowController: HistoryWindowController?
    private var tickTimer: Timer?
    private var idleMonitor: IdleMonitor?

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let store = try JSONWorkSessionStore.defaultStore()
            let weeklyGoalStore = try JSONWeeklyGoalStore.defaultStore()
            let workdayPlanStore = try JSONWorkdayPlanStore.defaultStore()
            let tracker = try TimeTracker(store: store)
            let model = try StewardModel(
                tracker: tracker,
                storageURL: store.fileURL,
                weeklyGoalStore: weeklyGoalStore,
                workdayPlanStore: workdayPlanStore
            )
            self.model = model

            let historyWindowController = HistoryWindowController(model: model)
            self.historyWindowController = historyWindowController

            statusBarController = StatusBarController(
                model: model,
                openHistory: { historyWindowController.show() },
                quit: { NSApplication.shared.terminate(nil) }
            )

            tickTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.tick()
                }
            }

            if let tickTimer {
                RunLoop.main.add(tickTimer, forMode: .common)
            }

            idleMonitor = IdleMonitor(
                threshold: 15 * 60,
                isTracking: { [weak model] in model?.isTracking == true },
                onGapDetected: { [weak self] gap in
                    self?.handleIdleGap(gap)
                }
            )
            idleMonitor?.start()

            LaunchAtLogin.enableIfPossible()
            statusBarController?.update()
        } catch {
            let alert = NSAlert()
            alert.messageText = "Steward could not start"
            alert.informativeText = error.localizedDescription
            alert.alertStyle = .critical
            alert.runModal()
            NSApplication.shared.terminate(nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let model, model.isTracking {
            model.tick(date: Date())
            model.stopTracking()
        }

        tickTimer?.invalidate()
        idleMonitor?.stop()
    }

    private func tick() {
        model?.tick()
        statusBarController?.update()
    }

    private func handleIdleGap(_ gap: IdleGap) {
        guard let model, model.pendingIdleGap == nil else {
            return
        }

        model.pendingIdleGap = gap
        statusBarController?.showPopover()
    }
}
