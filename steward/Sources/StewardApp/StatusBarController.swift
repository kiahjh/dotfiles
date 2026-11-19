import AppKit
import SwiftUI
import StewardCore

@MainActor
struct MenuActions {
    var openHistory: () -> Void
    var quit: () -> Void
    var refreshStatus: () -> Void
}

@MainActor
final class StatusBarController: NSObject {
    private let model: StewardModel
    private let statusItem: NSStatusItem
    private let popover: NSPopover
    private var pacingConfigurationObserver: NSObjectProtocol?
    private var lastRenderState: StatusBarRenderer.State?

    init(model: StewardModel, openHistory: @escaping () -> Void, quit: @escaping () -> Void) {
        self.model = model
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        self.popover = NSPopover()
        super.init()

        popover.behavior = .transient
        popover.animates = false
        // Let the themed background reach into the arrow instead of the default material.
        popover.hasFullSizeContent = true
        updatePopoverContentSize()
        let actions = MenuActions(
            openHistory: openHistory,
            quit: quit,
            refreshStatus: { [weak self] in
                self?.refreshAfterMenuAction()
            }
        )
        popover.contentViewController = NSHostingController(
            rootView: MenuPopoverView(model: model, actions: actions)
        )

        pacingConfigurationObserver = NotificationCenter.default.addObserver(
            forName: .stewardPacingConfigurationDidChange,
            object: model,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.update()
            }
        }

        if let button = statusItem.button {
            button.target = self
            button.action = #selector(togglePopover)
            button.imagePosition = .imageOnly
            button.imageScaling = .scaleNone
        }
    }

    func update() {
        updatePopoverContentSize()

        guard let button = statusItem.button else {
            return
        }

        // The status item image is shipped out of process to the menu bar on every assignment, and
        // macOS leaks memory per update. Only push a new image when what it shows actually changed.
        let snapshot = model.pacingSnapshot
        let renderState = StatusBarRenderer.State(
            snapshot: snapshot,
            isTracking: model.isTracking,
            appearance: button.effectiveAppearance.name,
            accent: .themeAccent
        )
        guard renderState != lastRenderState else {
            return
        }
        lastRenderState = renderState

        let image = StatusBarRenderer.render(
            snapshot: snapshot,
            isTracking: model.isTracking,
            appearance: button.effectiveAppearance
        )
        statusItem.length = image.size.width + 8
        button.image = image
        button.toolTip = tooltip(for: snapshot)

        if popover.isShown {
            positionPopoverWindow(relativeTo: button)
        }
    }

    func showPopover() {
        guard let button = statusItem.button else {
            return
        }

        if popover.isShown {
            popover.performClose(nil)
        }

        NSApplication.shared.activate(ignoringOtherApps: true)
        updatePopoverContentSize()
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        positionPopoverWindow(relativeTo: button)
    }

    @objc private func togglePopover() {
        guard let button = statusItem.button else {
            return
        }

        if popover.isShown {
            popover.performClose(nil)
        } else {
            NSApplication.shared.activate(ignoringOtherApps: true)
            updatePopoverContentSize()
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            positionPopoverWindow(relativeTo: button)
        }
    }

    private func refreshAfterMenuAction() {
        update()

        guard popover.isShown, let button = statusItem.button else {
            return
        }

        positionPopoverWindow(relativeTo: button)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self, weak button] in
            guard let self, let button, self.popover.isShown else {
                return
            }

            self.positionPopoverWindow(relativeTo: button)
        }
    }

    private func updatePopoverContentSize() {
        popover.contentSize = NSSize(
            width: MenuPopoverLayout.width,
            height: MenuPopoverLayout.height(hasIdleGap: model.pendingIdleGap != nil)
        )
    }

    private func positionPopoverWindow(relativeTo button: NSStatusBarButton) {
        DispatchQueue.main.async { [weak self, weak button] in
            guard let self,
                  let button,
                  let buttonWindow = button.window,
                  let popoverWindow = self.popover.contentViewController?.view.window,
                  let screen = buttonWindow.screen ?? NSScreen.main else {
                return
            }

            let buttonFrameInWindow = button.convert(button.bounds, to: nil)
            let buttonFrame = buttonWindow.convertToScreen(buttonFrameInWindow)
            var popoverFrame = popoverWindow.frame
            let visibleFrame = screen.visibleFrame

            let targetX = buttonFrame.midX - (popoverFrame.width / 2)
            popoverFrame.origin.x = min(
                max(targetX, visibleFrame.minX + 8),
                visibleFrame.maxX - popoverFrame.width - 8
            )
            popoverFrame.origin.y = buttonFrame.minY - popoverFrame.height - 2

            popoverWindow.setFrame(popoverFrame, display: true)
        }
    }

    private func tooltip(for snapshot: PacingSnapshot) -> String {
        let running = model.isTracking ? "Tracking" : "Stopped"
        return """
        Steward \(running)
        Today \(snapshot.daily.statusText())
        Week \(snapshot.weekly.statusText())
        """
    }
}

enum StatusBarRenderer {
    private static let barWidth: CGFloat = 72

    /// Everything that affects the rendered image or tooltip. The bar fill is quantized to Retina pixels.
    struct State: Equatable {
        var dailyLabels: [String]
        var weeklyLabels: [String]
        var dailyFill: Int
        var weeklyFill: Int
        var isTracking: Bool
        var appearance: NSAppearance.Name
        var accent: NSColor

        init(snapshot: PacingSnapshot, isTracking: Bool, appearance: NSAppearance.Name, accent: NSColor) {
            self.dailyLabels = [snapshot.daily.workedLabel, snapshot.daily.remainingLabel, snapshot.daily.asciiBar()]
            self.weeklyLabels = [snapshot.weekly.workedLabel, snapshot.weekly.remainingLabel, snapshot.weekly.asciiBar()]
            self.dailyFill = Int((snapshot.daily.fraction * barWidth * 2).rounded())
            self.weeklyFill = Int((snapshot.weekly.fraction * barWidth * 2).rounded())
            self.isTracking = isTracking
            self.appearance = appearance
            self.accent = accent
        }
    }

    /// Text and the empty track match the menu bar's other items, which macOS draws white or black
    /// depending on the wallpaper behind the menu bar, not the app's light or dark mode. (System
    /// label colors come out too dark here: they rely on vibrancy the image doesn't get.) Only the
    /// progress and the tracking dot use the theme's accent.
    @MainActor
    static func render(snapshot: PacingSnapshot, isTracking: Bool, appearance: NSAppearance) -> NSImage {
        let dark = appearance.bestMatch(from: [.aqua, .darkAqua, .vibrantLight, .vibrantDark])
            .map { $0 == .darkAqua || $0 == .vibrantDark } ?? false
        return draw(snapshot: snapshot, isTracking: isTracking, ink: dark ? .white : .black)
    }

    @MainActor
    private static func draw(snapshot: PacingSnapshot, isTracking: Bool, ink: NSColor) -> NSImage {
        let font = NSFont.monospacedDigitSystemFont(ofSize: 8.5, weight: .medium)
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byClipping
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: ink.withAlphaComponent(0.9),
            .paragraphStyle: paragraph
        ]
        let dailyLeft = snapshot.daily.workedLabel
        let dailyRight = snapshot.daily.remainingLabel
        let weeklyLeft = snapshot.weekly.workedLabel
        let weeklyRight = snapshot.weekly.remainingLabel
        let leftWidth = ceil(max(dailyLeft.size(withAttributes: attributes).width, weeklyLeft.size(withAttributes: attributes).width))
        let rightWidth = ceil(max(dailyRight.size(withAttributes: attributes).width, weeklyRight.size(withAttributes: attributes).width))
        let gap: CGFloat = 4
        let dotWidth: CGFloat = 9
        let width = ceil(dotWidth + leftWidth + gap + barWidth + gap + rightWidth + 3)
        let image = NSImage(size: NSSize(width: width, height: 22))

        image.lockFocus()
        NSColor.clear.setFill()
        NSRect(origin: .zero, size: image.size).fill()

        NSColor.themeAccent.withAlphaComponent(isTracking ? 1 : 0).setFill()
        NSBezierPath(ovalIn: NSRect(x: 1, y: 8.5, width: 5, height: 5)).fill()

        drawLine(
            line: snapshot.daily,
            leftText: dailyLeft,
            rightText: dailyRight,
            origin: NSPoint(x: dotWidth, y: 12.2),
            leftWidth: leftWidth,
            rightWidth: rightWidth,
            barWidth: barWidth,
            gap: gap,
            attributes: attributes,
            accent: .themeAccent
        )
        drawLine(
            line: snapshot.weekly,
            leftText: weeklyLeft,
            rightText: weeklyRight,
            origin: NSPoint(x: dotWidth, y: 2.2),
            leftWidth: leftWidth,
            rightWidth: rightWidth,
            barWidth: barWidth,
            gap: gap,
            attributes: attributes,
            accent: .themeAccent
        )
        image.unlockFocus()
        image.isTemplate = false
        return image
    }

    private static func drawLine(
        line: ProgressLine,
        leftText: String,
        rightText: String,
        origin: NSPoint,
        leftWidth: CGFloat,
        rightWidth: CGFloat,
        barWidth: CGFloat,
        gap: CGFloat,
        attributes: [NSAttributedString.Key: Any],
        accent: NSColor
    ) {
        let textY = origin.y - 1.5
        (leftText as NSString).draw(at: NSPoint(x: origin.x, y: textY), withAttributes: attributes)

        let barRect = NSRect(x: origin.x + leftWidth + gap, y: origin.y + 0.7, width: barWidth, height: 5)
        drawProgressBar(in: barRect, fraction: line.fraction, accent: accent, track: (attributes[.foregroundColor] as? NSColor)?.withAlphaComponent(0.25) ?? .tertiaryLabelColor)

        let rightX = barRect.maxX + gap
        (rightText as NSString).draw(at: NSPoint(x: rightX, y: textY), withAttributes: attributes)
    }

    private static func drawProgressBar(in rect: NSRect, fraction: Double, accent: NSColor, track: NSColor) {
        let radius = rect.height / 2
        let trackPath = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)

        track.setFill()
        trackPath.fill()

        guard fraction > 0 else {
            return
        }

        NSGraphicsContext.saveGraphicsState()
        trackPath.addClip()
        let fillWidth = rect.width * CGFloat(fraction)
        accent.setFill()
        NSRect(x: rect.minX, y: rect.minY, width: fillWidth, height: rect.height).fill()
        NSGraphicsContext.restoreGraphicsState()
    }
}
