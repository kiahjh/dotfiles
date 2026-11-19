import AppKit
import Observation
import SwiftUI
import StewardCore

@MainActor
final class HistoryWindowController {
    private let model: StewardModel
    private var state: HistoryWindowState?
    private var toolbarController: HistoryToolbarController?
    private var window: NSWindow?

    init(model: StewardModel) {
        self.model = model
    }

    func show() {
        if window == nil {
            let state = HistoryWindowState(model: model)
            let toolbarController = HistoryToolbarController(model: model, state: state)
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 1180, height: 760),
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered,
                defer: false
            )
            window.title = "Steward History"
            window.titleVisibility = .visible
            window.toolbarStyle = .unified
            window.minSize = NSSize(width: 980, height: 640)
            window.isReleasedWhenClosed = false
            window.toolbar = toolbarController.makeToolbar()
            _ = window.setFrameAutosaveName("StewardHistoryWindow")
            if !window.setFrameUsingName("StewardHistoryWindow") {
                window.center()
            }
            window.contentView = FocusClearingHostingView(rootView: HistoryView(model: model, state: state))
            followTheme { [weak window] in
                window?.backgroundColor = .themeBackground
            }
            self.state = state
            self.toolbarController = toolbarController
            self.window = window
        }

        NSApplication.shared.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}

private final class EventMonitorToken: @unchecked Sendable {
    private let value: Any

    init(_ value: Any) {
        self.value = value
    }

    deinit {
        NSEvent.removeMonitor(value)
    }
}

private final class FocusClearingHostingView<Content: View>: NSHostingView<Content> {
    private var mouseDownMonitor: EventMonitorToken?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        installMouseDownMonitorIfNeeded()
    }

    private func installMouseDownMonitorIfNeeded() {
        guard mouseDownMonitor == nil else {
            return
        }

        guard let monitor = NSEvent.addLocalMonitorForEvents(
            matching: [.leftMouseDown, .rightMouseDown],
            handler: { [weak self] event in
                self?.clearInputFocusIfNeeded(for: event)
                return event
            }
        ) else {
            return
        }

        mouseDownMonitor = EventMonitorToken(monitor)
    }

    private func clearInputFocusIfNeeded(for event: NSEvent) {
        guard let window,
              event.window === window,
              window.firstResponder?.isEditableInputResponder == true else {
            return
        }

        if let firstResponderView = window.firstResponder as? NSView,
           firstResponderView.containsWindowPoint(event.locationInWindow) {
            return
        }

        let location = convert(event.locationInWindow, from: nil)
        guard hitTest(location)?.isEditableInputOrDescendant != true else {
            return
        }

        window.makeFirstResponder(nil)
    }
}

private extension NSResponder {
    var isEditableInputResponder: Bool {
        if self is NSTextView || self is NSDatePicker {
            return true
        }

        if let textField = self as? NSTextField {
            return textField.isEditable
        }

        return false
    }
}

private extension NSView {
    func containsWindowPoint(_ point: NSPoint) -> Bool {
        bounds.contains(convert(point, from: nil))
    }

    var isEditableInputOrDescendant: Bool {
        var view: NSView? = self

        while let current = view {
            if current is NSTextView || current is NSDatePicker {
                return true
            }

            if let textField = current as? NSTextField, textField.isEditable {
                return true
            }

            view = current.superview
        }

        return false
    }
}

@MainActor
@Observable
private final class HistoryWindowState {
    static let weeksPerOverview = 10

    private static let displayModeDefaultsKey = "historyDisplayMode"

    var selectedWeekStart: Date
    var displayMode: HistoryDisplayMode {
        didSet {
            UserDefaults.standard.set(displayMode.rawValue, forKey: Self.displayModeDefaultsKey)
        }
    }

    init(model: StewardModel) {
        self.selectedWeekStart = model.startOfWeek(containing: model.now)
        self.displayMode = UserDefaults.standard
            .string(forKey: Self.displayModeDefaultsKey)
            .flatMap(HistoryDisplayMode.init(rawValue:))
            ?? .calendar
    }

    func selectDisplayMode(_ displayMode: HistoryDisplayMode, model: StewardModel) {
        self.displayMode = displayMode

        if displayMode == .weeks {
            selectCurrentPage(model: model)
        }
    }

    func selectCurrentPage(model: StewardModel) {
        selectedWeekStart = model.startOfWeek(containing: model.now)
    }

    func movePage(by value: Int, model: StewardModel) {
        let weekCount = displayMode == .weeks ? Self.weeksPerOverview : 1
        let currentWeekStart = model.startOfWeek(containing: model.now)
        let candidate = model.stewardCalendar.calendar.date(
            byAdding: .day,
            value: value * weekCount * 7,
            to: selectedWeekStart
        ) ?? selectedWeekStart
        selectedWeekStart = min(candidate, currentWeekStart)
    }

    func canMoveForward(model: StewardModel) -> Bool {
        selectedWeekStart < model.startOfWeek(containing: model.now)
    }

    func weekRangeText(model: StewardModel) -> String {
        let end = model.stewardCalendar.calendar.date(
            byAdding: .day,
            value: 6,
            to: selectedWeekStart
        ) ?? selectedWeekStart
        return "\(selectedWeekStart.formatted(.dateTime.month(.abbreviated).day())) - \(end.formatted(.dateTime.month(.abbreviated).day().year()))"
    }
}

@MainActor
private final class HistoryToolbarController: NSObject, NSToolbarDelegate {
    private let model: StewardModel
    private let state: HistoryWindowState
    private weak var weekNavigationControl: NSSegmentedControl?

    init(model: StewardModel, state: HistoryWindowState) {
        self.model = model
        self.state = state
    }

    func makeToolbar() -> NSToolbar {
        let toolbar = NSToolbar(identifier: "StewardHistoryToolbar")
        toolbar.allowsUserCustomization = false
        toolbar.autosavesConfiguration = false
        toolbar.displayMode = .iconOnly
        toolbar.sizeMode = .regular
        toolbar.delegate = self
        return toolbar
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        toolbarDefaultItemIdentifiers(toolbar)
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [
            .flexibleSpace,
            .historyDisplayMode,
            .space,
            .historyWeekNavigation
        ]
    }

    func toolbar(
        _ toolbar: NSToolbar,
        itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier,
        willBeInsertedIntoToolbar flag: Bool
    ) -> NSToolbarItem? {
        switch itemIdentifier {
        case .historyDisplayMode:
            displayModeItem(identifier: itemIdentifier)

        case .historyWeekNavigation:
            weekNavigationItem(identifier: itemIdentifier)

        default:
            nil
        }
    }

    private func displayModeItem(identifier: NSToolbarItem.Identifier) -> NSToolbarItem {
        let item = NSToolbarItem(itemIdentifier: identifier)
        let control = NSSegmentedControl(
            labels: HistoryDisplayMode.allCases.map { _ in "" },
            trackingMode: .selectOne,
            target: self,
            action: #selector(displayModeChanged(_:))
        )
        control.segmentStyle = .automatic
        control.controlSize = .regular
        control.selectedSegment = state.displayMode.segmentIndex
        for displayMode in HistoryDisplayMode.allCases {
            control.setImage(displayMode.image, forSegment: displayMode.segmentIndex)
            control.setToolTip(displayMode.title, forSegment: displayMode.segmentIndex)
            control.setWidth(36, forSegment: displayMode.segmentIndex)
        }

        item.label = "View"
        item.paletteLabel = "View"
        item.toolTip = "Change history view"
        item.view = control
        return item
    }

    private func weekNavigationItem(identifier: NSToolbarItem.Identifier) -> NSToolbarItem {
        let item = NSToolbarItem(itemIdentifier: identifier)
        let control = NSSegmentedControl(
            labels: ["", "This Week", ""],
            trackingMode: .momentary,
            target: self,
            action: #selector(weekNavigationChanged(_:))
        )
        control.segmentStyle = .automatic
        control.controlSize = .regular
        control.setWidth(32, forSegment: 0)
        control.setWidth(78, forSegment: 1)
        control.setWidth(32, forSegment: 2)
        weekNavigationControl = control
        updateWeekNavigationControl()

        item.label = "Week"
        item.paletteLabel = "Week"
        item.toolTip = "Navigate weeks"
        item.view = control
        return item
    }

    private func updateWeekNavigationControl() {
        guard let control = weekNavigationControl else {
            return
        }

        let isOverview = state.displayMode == .weeks
        let previousDescription = isOverview ? "Previous 10 weeks" : "Previous week"
        let nextDescription = isOverview ? "Next 10 weeks" : "Next week"

        control.setImage(
            NSImage(systemSymbolName: "chevron.left", accessibilityDescription: previousDescription),
            forSegment: 0
        )
        control.setLabel(isOverview ? "Latest 10" : "This Week", forSegment: 1)
        control.setImage(
            NSImage(systemSymbolName: "chevron.right", accessibilityDescription: nextDescription),
            forSegment: 2
        )
        control.setToolTip(previousDescription, forSegment: 0)
        control.setToolTip(isOverview ? "Latest 10 weeks" : "This week", forSegment: 1)
        control.setToolTip(nextDescription, forSegment: 2)
        control.setEnabled(state.canMoveForward(model: model), forSegment: 2)
    }

    @objc
    private func displayModeChanged(_ sender: NSSegmentedControl) {
        guard let displayMode = HistoryDisplayMode(segmentIndex: sender.selectedSegment) else {
            sender.selectedSegment = state.displayMode.segmentIndex
            return
        }

        state.selectDisplayMode(displayMode, model: model)
        updateWeekNavigationControl()
    }

    @objc
    private func weekNavigationChanged(_ sender: NSSegmentedControl) {
        switch sender.selectedSegment {
        case 0:
            state.movePage(by: -1, model: model)
        case 1:
            state.selectCurrentPage(model: model)
        case 2:
            state.movePage(by: 1, model: model)
        default:
            break
        }

        updateWeekNavigationControl()
    }
}

private extension NSToolbarItem.Identifier {
    static let historyDisplayMode = NSToolbarItem.Identifier("StewardHistoryToolbarDisplayMode")
    static let historyWeekNavigation = NSToolbarItem.Identifier("StewardHistoryToolbarWeekNavigation")
}

private struct WeekHistoryData {
    let weekStart: Date
    let days: [Date]
    let sessions: [WorkSession]
    let allSlices: [WorkSlice]
    let slicesByDay: [Date: [WorkSlice]]
    let dailyTotals: [Date: TimeInterval]
    let dailyTargets: [Date: TimeInterval]
    let weeklyTotal: TimeInterval
    let plannedDays: Set<Date>
    let todayStart: Date
    let stewardCalendar: StewardCalendar

    @MainActor
    init(weekStart: Date, model: StewardModel) {
        let stewardCalendar = model.stewardCalendar
        let now = model.now
        let normalizedWeekStart = stewardCalendar.startOfWeek(containing: weekStart)
        let workdayPlan = model.workdayPlan(containing: normalizedWeekStart)
        let weeklyGoal = model.weeklyGoal(containing: normalizedWeekStart)
        let weekEnd = stewardCalendar.endOfWeek(containing: normalizedWeekStart)
        let days = stewardCalendar.daysInWeek(containing: normalizedWeekStart)
        let sessions = model.sessions.filter { session in
            session.startedAt < weekEnd && session.effectiveEnd(through: now) > normalizedWeekStart
        }
        .sorted { $0.startedAt < $1.startedAt }
        let allSlices = stewardCalendar.splitSessionsByDay(
            sessions,
            from: normalizedWeekStart,
            to: weekEnd,
            now: now
        )
        var slicesByDay = Dictionary(uniqueKeysWithValues: days.map { ($0, [WorkSlice]()) })

        for slice in allSlices {
            let dayStart = stewardCalendar.startOfDay(for: slice.startedAt)
            slicesByDay[dayStart, default: []].append(slice)
        }

        self.weekStart = normalizedWeekStart
        self.days = days
        self.sessions = sessions
        self.allSlices = allSlices
        self.slicesByDay = slicesByDay
        self.dailyTotals = Dictionary(uniqueKeysWithValues: days.map { day in
            (day, slicesByDay[day, default: []].reduce(0) { $0 + $1.duration })
        })
        self.dailyTargets = Dictionary(uniqueKeysWithValues: days.map { day in
            let target = GoalPacing(stewardCalendar: stewardCalendar).projectedTargetForDay(
                containing: day,
                sessions: sessions,
                now: now,
                weeklyGoal: weeklyGoal,
                workdayPlan: workdayPlan
            )
            return (day, target)
        })
        self.weeklyTotal = allSlices.reduce(0) { $0 + $1.duration }
        self.plannedDays = Set(days.filter { day in
            workdayPlan.isPlanned(weekdayNumber: stewardCalendar.weekdayNumber(for: day))
        })
        self.todayStart = stewardCalendar.startOfDay(for: now)
        self.stewardCalendar = stewardCalendar
    }

    func dailyTotal(on day: Date) -> TimeInterval {
        dailyTotals[day, default: 0]
    }

    func dailyTarget(on day: Date) -> TimeInterval {
        dailyTargets[day, default: 0]
    }

    func slices(on day: Date) -> [WorkSlice] {
        slicesByDay[day, default: []]
    }

    func isToday(_ day: Date) -> Bool {
        day == todayStart
    }

    func isPlanned(_ day: Date) -> Bool {
        plannedDays.contains(day)
    }
}

private struct WeeklyOverviewWeek: Identifiable {
    let weekStart: Date
    let total: TimeInterval
    let goal: TimeInterval
    let position: Int
    let isCurrent: Bool

    var id: Date {
        weekStart
    }
}

private struct WeeklyOverviewData {
    let weeks: [WeeklyOverviewWeek]
    let rangeText: String
    let total: TimeInterval
    let combinedGoal: TimeInterval

    @MainActor
    init(endingWeekStart: Date, model: StewardModel) {
        let stewardCalendar = model.stewardCalendar
        let currentWeekStart = stewardCalendar.startOfWeek(containing: model.now)
        let normalizedEnd = min(
            stewardCalendar.startOfWeek(containing: endingWeekStart),
            currentWeekStart
        )
        let weekStarts = stewardCalendar.weekStarts(
            count: HistoryWindowState.weeksPerOverview,
            endingAt: normalizedEnd
        )
        let rangeStart = weekStarts.first ?? normalizedEnd
        let lastWeekStart = weekStarts.last ?? normalizedEnd
        let rangeEnd = stewardCalendar.endOfWeek(containing: lastWeekStart)
        let sessions = model.sessions.filter { session in
            session.startedAt < rangeEnd
                && session.effectiveEnd(through: model.now) > rangeStart
        }
        let slices = stewardCalendar.splitSessionsByDay(
            sessions,
            from: rangeStart,
            to: rangeEnd,
            now: model.now
        )
        var totalsByWeek = Dictionary(
            uniqueKeysWithValues: weekStarts.map { ($0, TimeInterval.zero) }
        )

        for slice in slices {
            let weekStart = stewardCalendar.startOfWeek(containing: slice.startedAt)
            totalsByWeek[weekStart, default: 0] += slice.duration
        }

        let weeks = weekStarts.enumerated().map { position, weekStart in
            WeeklyOverviewWeek(
                weekStart: weekStart,
                total: totalsByWeek[weekStart, default: 0],
                goal: model.weeklyGoal(containing: weekStart),
                position: position,
                isCurrent: weekStart == currentWeekStart
            )
        }
        let rangeEndDay = stewardCalendar.calendar.date(
            byAdding: .day,
            value: -1,
            to: rangeEnd
        ) ?? lastWeekStart

        self.weeks = weeks
        self.rangeText = "\(rangeStart.formatted(.dateTime.month(.abbreviated).day())) - \(rangeEndDay.formatted(.dateTime.month(.abbreviated).day().year()))"
        self.total = weeks.reduce(0) { $0 + $1.total }
        self.combinedGoal = weeks.reduce(0) { $0 + $1.goal }
    }
}

private struct HistoryView: View {
    var model: StewardModel
    var state: HistoryWindowState

    var body: some View {
        ScrollView {
            historyContent
                .padding(.bottom, 28)
        }
        .padding(.horizontal, 28)
        .padding(.top, 22)
        .padding(.bottom, 28)
        .frame(minWidth: 980, minHeight: 640)
        .background(Color.themeBackground)
        .foregroundStyle(Color.themeForeground)
        .tint(Color.themeAccent)
    }

    @ViewBuilder
    private var historyContent: some View {
        switch state.displayMode {
        case .calendar, .bars:
            let week = WeekHistoryData(weekStart: state.selectedWeekStart, model: model)

            VStack(alignment: .leading, spacing: 22) {
                historySummary(week: week)
                historyChart(week: week)
                sessionEditor(sessions: week.sessions)
            }

        case .weeks:
            let overview = WeeklyOverviewData(
                endingWeekStart: state.selectedWeekStart,
                model: model
            )

            VStack(alignment: .leading, spacing: 22) {
                overviewSummary(overview: overview)
                WeeklyOverviewHistogramView(overview: overview)
            }
        }
    }

    private func historySummary(week: WeekHistoryData) -> some View {
        HStack(alignment: .center, spacing: 22) {
            VStack(alignment: .leading, spacing: 4) {
                Text(state.weekRangeText(model: model))
                    .font(.system(.title2, design: .default, weight: .semibold))

                Text("\(week.sessions.count) \(week.sessions.count == 1 ? "session" : "sessions")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 16)

            WeeklyGoalEditor(model: model, weekStart: state.selectedWeekStart)

            Divider()
                .frame(height: 34)

            VStack(alignment: .trailing, spacing: 2) {
                Text(TimeFormatting.hoursMinutes(week.weeklyTotal))
                    .font(.system(.title2, design: .rounded, weight: .semibold))
                    .monospacedDigit()

                Text("weekly total")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func overviewSummary(overview: WeeklyOverviewData) -> some View {
        HStack(alignment: .center, spacing: 22) {
            VStack(alignment: .leading, spacing: 4) {
                Text("10-Week Overview")
                    .font(.system(.title2, design: .default, weight: .semibold))

                Text(overview.rangeText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 16)

            VStack(alignment: .trailing, spacing: 2) {
                Text(TimeFormatting.hoursMinutes(overview.combinedGoal))
                    .font(.system(.title2, design: .rounded, weight: .semibold))
                    .monospacedDigit()

                Text("combined goal")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Divider()
                .frame(height: 34)

            VStack(alignment: .trailing, spacing: 2) {
                Text(TimeFormatting.hoursMinutes(overview.total))
                    .font(.system(.title2, design: .rounded, weight: .semibold))
                    .monospacedDigit()

                Text("total logged")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func historyChart(week: WeekHistoryData) -> some View {
        switch state.displayMode {
        case .calendar:
            WeekTimelineView(week: week) { day in
                model.togglePlannedWorkday(on: day)
            }

        case .bars:
            WeekHistogramView(week: week) { day in
                model.togglePlannedWorkday(on: day)
            }

        case .weeks:
            EmptyView()
        }
    }

    private func sessionEditor(sessions: [WorkSession]) -> some View {
        let orderedSessions = sessions.sorted { $0.startedAt > $1.startedAt }

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Edit Sessions")
                    .font(.title3)
                    .bold()

                Text("\(sessions.count) entries")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()
            }

            if sessions.isEmpty {
                ContentUnavailableView(
                    "No work logged",
                    systemImage: "calendar.badge.clock",
                    description: Text("Tracked sessions for this week will appear here.")
                )
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
                .background(Color.themePanel, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                LazyVStack(spacing: 8) {
                    ForEach(orderedSessions) { session in
                        EditableSessionRow(session: session, model: model)
                    }
                }
            }
        }
    }

}

private enum HistoryDisplayMode: String, CaseIterable, Identifiable {
    case calendar
    case bars
    case weeks

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .calendar:
            "Calendar"
        case .bars:
            "Daily Bars"
        case .weeks:
            "10-Week Bars"
        }
    }

    var image: NSImage {
        switch self {
        case .calendar:
            NSImage(systemSymbolName: "calendar", accessibilityDescription: title) ?? NSImage()
        case .bars:
            NSImage(systemSymbolName: "chart.bar", accessibilityDescription: title) ?? NSImage()
        case .weeks:
            NSImage(systemSymbolName: "chart.bar.xaxis", accessibilityDescription: title) ?? NSImage()
        }
    }

    var segmentIndex: Int {
        switch self {
        case .calendar:
            0
        case .bars:
            1
        case .weeks:
            2
        }
    }

    init?(segmentIndex: Int) {
        switch segmentIndex {
        case 0:
            self = .calendar
        case 1:
            self = .bars
        case 2:
            self = .weeks
        default:
            return nil
        }
    }
}

private struct WeeklyGoalEditor: View {
    var model: StewardModel
    let weekStart: Date

    private var goalHours: Binding<Double> {
        Binding(
            get: { model.weeklyGoal(containing: weekStart) / 3600 },
            set: { model.setWeeklyGoal($0 * 3600, containing: weekStart) }
        )
    }

    var body: some View {
        HStack(spacing: 6) {
            Text("Goal")
                .font(.caption)
                .foregroundStyle(.secondary)

            TextField(
                "40",
                value: goalHours,
                format: .number.precision(.fractionLength(0...1))
            )
            .textFieldStyle(.roundedBorder)
            .multilineTextAlignment(.trailing)
            .monospacedDigit()
            .frame(width: 58)

            Text("hrs")
                .font(.caption)
                .foregroundStyle(.secondary)

            Stepper("Weekly goal", value: goalHours, in: 0...168, step: 0.5)
                .labelsHidden()
        }
        .controlSize(.small)
    }
}

private struct WeekTimelineView: View {
    let week: WeekHistoryData
    let togglePlannedWorkday: (Date) -> Void

    var body: some View {
        let range = TimelineRange(slices: week.allSlices, stewardCalendar: week.stewardCalendar)

        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Color.clear
                    .frame(width: 58)

                ForEach(week.days, id: \.self) { day in
                    DayHeader(
                        day: day,
                        total: week.dailyTotal(on: day),
                        isToday: week.isToday(day),
                        isPlanned: week.isPlanned(day),
                        togglePlannedWorkday: togglePlannedWorkday
                    )
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 10)

            HStack(alignment: .top, spacing: 0) {
                TimeRuler(range: range)
                    .frame(width: 58, height: range.height)

                ForEach(Array(week.days.enumerated()), id: \.element) { index, day in
                    DayTimelineColumn(
                        day: day,
                        index: index,
                        range: range,
                        slices: week.slices(on: day),
                        isToday: week.isToday(day),
                        isPlanned: week.isPlanned(day)
                    )
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(14)
        .background(Color.themePanel, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.themeBorder.opacity(0.45), lineWidth: 1)
        }
    }
}

private struct WeekHistogramView: View {
    private static let chartHeight: CGFloat = 320

    let week: WeekHistoryData
    let togglePlannedWorkday: (Date) -> Void

    var body: some View {
        let scale = HistogramScale(
            totals: week.days.map { week.dailyTotal(on: $0) },
            targets: week.days.map { week.dailyTarget(on: $0) }
        )

        VStack(spacing: 0) {
            HStack(alignment: .bottom, spacing: 0) {
                HistogramRuler(scale: scale)
                    .frame(width: 58, height: Self.chartHeight)

                ZStack(alignment: .topLeading) {
                    HistogramGrid(scale: scale)

                    HStack(alignment: .bottom, spacing: 0) {
                        ForEach(Array(week.days.enumerated()), id: \.element) { index, day in
                            DayHistogramColumn(
                                day: day,
                                index: index,
                                total: week.dailyTotal(on: day),
                                target: week.dailyTarget(on: day),
                                scale: scale,
                                isToday: week.isToday(day),
                                isPlanned: week.isPlanned(day)
                            )
                            .frame(maxWidth: .infinity)
                        }
                    }
                }
                .frame(height: Self.chartHeight)
                .clipShape(Rectangle())
            }
            .frame(height: Self.chartHeight)

            HStack(spacing: 0) {
                Color.clear
                    .frame(width: 58)

                ForEach(week.days, id: \.self) { day in
                    DayHeader(
                        day: day,
                        total: week.dailyTotal(on: day),
                        isToday: week.isToday(day),
                        isPlanned: week.isPlanned(day),
                        togglePlannedWorkday: togglePlannedWorkday
                    )
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 10)
        }
        .padding(14)
        .background(Color.themePanel, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.themeBorder.opacity(0.45), lineWidth: 1)
        }
    }
}

private struct WeeklyOverviewHistogramView: View {
    private static let chartHeight: CGFloat = 320

    let overview: WeeklyOverviewData

    var body: some View {
        let scale = HistogramScale(
            totals: overview.weeks.map(\.total),
            targets: overview.weeks.map(\.goal),
            desiredTickCount: 4
        )

        VStack(spacing: 0) {
            HStack(alignment: .bottom, spacing: 0) {
                HistogramRuler(scale: scale)
                    .frame(width: 58, height: Self.chartHeight)

                ZStack(alignment: .topLeading) {
                    HistogramGrid(scale: scale)

                    HStack(alignment: .bottom, spacing: 0) {
                        ForEach(overview.weeks) { week in
                            WeeklyHistogramColumn(week: week, scale: scale)
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
                .frame(height: Self.chartHeight)
                .clipShape(Rectangle())
            }
            .frame(height: Self.chartHeight)

            HStack(spacing: 0) {
                Color.clear
                    .frame(width: 58)

                ForEach(overview.weeks) { week in
                    WeeklyHistogramHeader(week: week)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 10)
        }
        .padding(14)
        .background(Color.themePanel, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.themeBorder.opacity(0.45), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Weekly hours compared with goals")
    }
}

private struct WeeklyHistogramColumn: View {
    let week: WeeklyOverviewWeek
    let scale: HistogramScale

    var body: some View {
        GeometryReader { proxy in
            let barHeight = scale.barHeight(for: week.total, height: proxy.size.height)
            let barWidth = min(46, max(18, proxy.size.width * 0.42))

            ZStack(alignment: .bottom) {
                ZStack(alignment: .top) {
                    Rectangle()
                        .fill(columnFill)

                    if week.goal > 0 {
                        HistogramTargetMarker(isMet: week.total >= week.goal)
                            .frame(width: proxy.size.width)
                            .offset(y: scale.yOffset(for: week.goal, height: proxy.size.height) - 0.75)
                            .help("\(goalStatusText): \(TimeFormatting.hoursMinutes(week.goal))")
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                if week.total == 0 {
                    Rectangle()
                        .fill(Color.themeBorder.opacity(0.32))
                        .frame(width: barWidth, height: 1)
                        .padding(.bottom, 1)
                } else {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(barFill)
                        .frame(width: barWidth, height: barHeight)
                        .shadow(color: Color.themeAccent.opacity(0.16), radius: 6, y: 2)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabel)
            .help(accessibilityLabel)
        }
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Color.themeBorder.opacity(0.45))
                .frame(width: 1)
        }
    }

    private var barFill: LinearGradient {
        LinearGradient(
            colors: [Color.themeAccent, Color.themeAccent.opacity(0.68)],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private var columnFill: Color {
        if week.isCurrent {
            return Color.themeAccent.opacity(0.075)
        }

        return week.position.isMultiple(of: 2)
            ? Color.themePanel.opacity(0.34)
            : Color.themePanel.opacity(0.18)
    }

    private var accessibilityLabel: String {
        let weekText = week.weekStart.formatted(
            .dateTime.weekday(.wide).month(.wide).day().year()
        )
        let currentText = week.isCurrent ? "Current week, " : ""
        let goalText = week.goal > 0
            ? "\(TimeFormatting.hoursMinutes(week.goal)) goal, \(goalStatusText.lowercased())"
            : "no goal"
        return "\(currentText)week of \(weekText), \(TimeFormatting.hoursMinutes(week.total)) logged, \(goalText)"
    }

    private var goalStatusText: String {
        week.total >= week.goal ? "Goal met" : "Goal not met"
    }
}

private struct WeeklyHistogramHeader: View {
    let week: WeeklyOverviewWeek

    var body: some View {
        VStack(spacing: 3) {
            Text(week.weekStart, format: .dateTime.month(.abbreviated).day())
                .font(.headline)
                .foregroundStyle(week.isCurrent ? Color.themeAccent : .primary)

            Text(TimeFormatting.hoursMinutes(week.total))
                .font(.system(.headline, design: .rounded, weight: .semibold))
                .monospacedDigit()

            Text(goalText)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 4)
        .padding(.vertical, 9)
        .background(
            week.isCurrent
                ? Color.themeAccent.opacity(0.10)
                : Color.themePanel.opacity(0.36),
            in: RoundedRectangle(cornerRadius: 8, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(
                    week.isCurrent
                        ? Color.themeAccent.opacity(0.42)
                        : Color.themeBorder.opacity(0.28),
                    lineWidth: 1
                )
        }
        .padding(.horizontal, 3)
        .accessibilityElement(children: .combine)
    }

    private var goalText: String {
        guard week.goal > 0 else {
            return week.isCurrent ? "Current · no goal" : "No goal"
        }

        let goal = "Goal \(TimeFormatting.hoursMinutes(week.goal))"
        return week.isCurrent ? "Current · \(goal.lowercased())" : goal
    }
}

private struct DayHistogramColumn: View {
    let day: Date
    let index: Int
    let total: TimeInterval
    let target: TimeInterval
    let scale: HistogramScale
    let isToday: Bool
    let isPlanned: Bool

    var body: some View {
        GeometryReader { proxy in
            let barHeight = scale.barHeight(for: total, height: proxy.size.height)
            let barWidth = min(46, max(18, proxy.size.width * 0.42))

            ZStack(alignment: .bottom) {
                ZStack(alignment: .top) {
                    Rectangle()
                        .fill(columnFill)

                    if target > 0 {
                        HistogramTargetMarker(isMet: total >= target)
                            .frame(width: proxy.size.width)
                            .offset(y: scale.yOffset(for: target, height: proxy.size.height) - 0.75)
                            .help("\(targetStatusText): \(TimeFormatting.hoursMinutes(target))")
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                if total == 0 {
                    Rectangle()
                        .fill(Color.themeBorder.opacity(0.32))
                        .frame(width: barWidth, height: 1)
                        .padding(.bottom, 1)
                } else {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(barFill)
                        .frame(width: barWidth, height: barHeight)
                        .shadow(color: barShadow, radius: 6, y: 2)
                }
            }
            .accessibilityLabel(accessibilityLabel)
        }
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Color.themeBorder.opacity(0.45))
                .frame(width: 1)
        }
    }

    private var barFill: LinearGradient {
        let baseColor = isPlanned ? Color.themeAccent : Color.themePurple
        return LinearGradient(
            colors: [
                baseColor,
                baseColor.opacity(isPlanned ? 0.68 : 0.62)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private var barShadow: Color {
        (isPlanned ? Color.themeAccent : Color.themePurple).opacity(0.16)
    }

    private var columnFill: Color {
        if !isPlanned {
            return Color.themeBorder.opacity(isToday ? 0.10 : 0.07)
        }

        if isToday {
            return Color.themeAccent.opacity(0.075)
        }

        return index.isMultiple(of: 2)
            ? Color.themePanel.opacity(0.34)
            : Color.themePanel.opacity(0.18)
    }

    private var accessibilityLabel: String {
        let dayText = day.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
        let goalText = target > 0 ? ", \(TimeFormatting.hoursMinutes(target)) goal \(targetStatusText.lowercased())" : ""
        return "\(dayText), \(TimeFormatting.hoursMinutes(total)) logged\(goalText)"
    }

    private var targetStatusText: String {
        total >= target ? "Goal met" : "Goal not met"
    }
}

private struct HistogramTargetMarker: View {
    private static let lineWidth: CGFloat = 1.5

    let isMet: Bool

    var body: some View {
        GeometryReader { proxy in
            Path { path in
                path.move(to: CGPoint(x: 0, y: Self.lineWidth / 2))
                path.addLine(to: CGPoint(x: proxy.size.width, y: Self.lineWidth / 2))
            }
            .stroke(color, style: StrokeStyle(lineWidth: Self.lineWidth, lineCap: .round, dash: [3, 4]))
        }
        .frame(height: Self.lineWidth)
        .shadow(color: Color.themeBackground.opacity(0.6), radius: 0.5, y: 0)
    }

    private var color: Color {
        (isMet ? Color.themeGreen : Color.themeMuted)
            .opacity(isMet ? 0.44 : 0.42)
    }
}

private struct HistogramGrid: View {
    let scale: HistogramScale

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                ForEach(scale.tickValues, id: \.self) { tick in
                    Rectangle()
                        .fill(Color.themeBorder.opacity(tick == 0 ? 0.36 : 0.22))
                        .frame(height: 1)
                        .offset(y: scale.yOffset(for: tick, height: proxy.size.height))
                }
            }
        }
    }
}

private struct HistogramRuler: View {
    let scale: HistogramScale

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topTrailing) {
                ForEach(scale.tickValues, id: \.self) { tick in
                    Text(scale.label(for: tick))
                        .font(.system(size: 10, weight: .medium, design: .rounded))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .offset(y: scale.yOffset(for: tick, height: proxy.size.height) - 7)
                }
            }
            .padding(.trailing, 8)
        }
    }
}

private struct HistogramScale: Equatable {
    let maxValue: TimeInterval
    let tickValues: [TimeInterval]

    init(
        totals: [TimeInterval],
        targets: [TimeInterval] = [],
        desiredTickCount: Int? = nil
    ) {
        let maxHours = ((totals + targets).max() ?? 0) / 3600
        let ceilingHours: Double
        let stepHours: Double

        if let desiredTickCount {
            stepHours = Self.niceTickStepHours(
                for: maxHours / Double(max(1, desiredTickCount))
            )
            ceilingHours = max(stepHours, ceil(maxHours / stepHours) * stepHours)
        } else {
            ceilingHours = Self.niceCeilingHours(for: maxHours)
            stepHours = Self.tickStepHours(for: ceilingHours)
        }

        self.maxValue = ceilingHours * 3600
        self.tickValues = Self.tickValues(ceilingHours: ceilingHours, stepHours: stepHours)
    }

    func barHeight(for total: TimeInterval, height: CGFloat) -> CGFloat {
        guard total > 0 else {
            return 0
        }

        return max(4, fraction(for: total) * height)
    }

    func yOffset(for value: TimeInterval, height: CGFloat) -> CGFloat {
        (1 - fraction(for: value)) * height
    }

    func label(for value: TimeInterval) -> String {
        let minutes = Int((value / 60).rounded())

        if minutes == 0 {
            return "0"
        }

        if minutes < 60 {
            return "\(minutes)m"
        }

        let hours = minutes / 60
        let remainingMinutes = minutes % 60

        if remainingMinutes == 0 {
            return "\(hours)h"
        }

        return "\(hours):\(String(format: "%02d", remainingMinutes))"
    }

    private func fraction(for value: TimeInterval) -> CGFloat {
        guard maxValue > 0 else {
            return 0
        }

        return CGFloat(max(0, min(1, value / maxValue)))
    }

    private static func niceCeilingHours(for hours: Double) -> Double {
        guard hours > 1 else {
            return 1
        }

        if hours <= 4 {
            return ceil(hours)
        }

        if hours <= 8 {
            return ceil(hours / 2) * 2
        }

        if hours <= 12 {
            return ceil(hours / 3) * 3
        }

        return ceil(hours / 4) * 4
    }

    private static func tickStepHours(for ceilingHours: Double) -> Double {
        if ceilingHours <= 1 {
            return 0.5
        }

        if ceilingHours <= 4 {
            return 1
        }

        if ceilingHours <= 8 {
            return 2
        }

        if ceilingHours <= 12 {
            return 3
        }

        return 4
    }

    private static func niceTickStepHours(for roughStepHours: Double) -> Double {
        guard roughStepHours > 0 else {
            return 1
        }

        let magnitude = pow(10, floor(log10(roughStepHours)))
        let normalized = roughStepHours / magnitude
        let niceNormalized: Double

        if normalized <= 1 {
            niceNormalized = 1
        } else if normalized <= 2 {
            niceNormalized = 2
        } else if normalized <= 2.5 {
            niceNormalized = 2.5
        } else if normalized <= 5 {
            niceNormalized = 5
        } else {
            niceNormalized = 10
        }

        return niceNormalized * magnitude
    }

    private static func tickValues(ceilingHours: Double, stepHours: Double) -> [TimeInterval] {
        var values = [TimeInterval]()
        var hours = 0.0

        while hours < ceilingHours {
            values.append(hours * 3600)
            hours += stepHours
        }

        values.append(ceilingHours * 3600)
        return values
    }
}

private struct DayHeader: View {
    let day: Date
    let total: TimeInterval
    let isToday: Bool
    let isPlanned: Bool
    let togglePlannedWorkday: (Date) -> Void

    var body: some View {
        Button {
            togglePlannedWorkday(day)
        } label: {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(day, format: .dateTime.weekday(.abbreviated))
                        .font(.headline)

                    Text(day, format: .dateTime.month(.abbreviated).day())
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 2) {
                    Text(TimeFormatting.hoursMinutes(total))
                        .font(.system(.headline, design: .rounded, weight: .semibold))
                        .monospacedDigit()

                    Text(isPlanned ? "Work" : "Off")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(isPlanned ? Color.themeAccent : .secondary)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .foregroundStyle(isPlanned ? .primary : .secondary)
        .background(
            headerBackground(isToday: isToday, isPlanned: isPlanned),
            in: RoundedRectangle(cornerRadius: 9, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(headerStroke(isToday: isToday, isPlanned: isPlanned), lineWidth: 1)
        }
        .opacity(isPlanned ? 1 : 0.72)
        .padding(.horizontal, 4)
        .help(isPlanned ? "Mark as not planned" : "Mark as planned")
        .accessibilityLabel(accessibilityLabel(total: total, isPlanned: isPlanned))
        .accessibilityHint("Toggles whether this day is planned for work.")
    }

    private func headerBackground(isToday: Bool, isPlanned: Bool) -> Color {
        if isToday {
            return Color.themeAccent.opacity(isPlanned ? 0.14 : 0.06)
        }

        return Color.themePanel.opacity(isPlanned ? 0.56 : 0.24)
    }

    private func headerStroke(isToday: Bool, isPlanned: Bool) -> Color {
        if isToday || isPlanned {
            return Color.themeAccent.opacity(isToday ? 0.42 : 0.24)
        }

        return Color.themeBorder.opacity(0.36)
    }

    private func accessibilityLabel(total: TimeInterval, isPlanned: Bool) -> String {
        let dayText = day.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
        let planText = isPlanned ? "planned work day" : "off day"
        return "\(dayText), \(planText), \(TimeFormatting.hoursMinutes(total)) logged"
    }
}

private struct DayTimelineColumn: View {
    let day: Date
    let index: Int
    let range: TimelineRange
    let slices: [WorkSlice]
    let isToday: Bool
    let isPlanned: Bool

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Rectangle()
                    .fill(columnFill(isToday: isToday, isPlanned: isPlanned))

                if slices.isEmpty {
                    DiagonalStripes()
                        .stroke(Color.themeBorder.opacity(0.24), lineWidth: 4)
                        .background(Color.themeBorder.opacity(0.035))
                        .clipShape(Rectangle())
                        .accessibilityLabel("No work recorded")
                }

                hourLines(height: proxy.size.height)

                ForEach(slices) { slice in
                    let yStart = range.yOffset(for: slice.startedAt, dayStart: day, height: proxy.size.height)
                    let yEnd = range.yOffset(for: slice.endedAt, dayStart: day, height: proxy.size.height)
                    let blockHeight = max(0, yEnd - yStart)

                    TimelineSessionBlock(slice: slice)
                        .frame(width: max(20, proxy.size.width - 16), height: blockHeight, alignment: .topLeading)
                        .offset(x: 8, y: yStart)
                }
            }
        }
        .frame(height: range.height)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Color.themeBorder.opacity(0.55))
                .frame(width: 1)
        }
    }

    @ViewBuilder
    private func hourLines(height: CGFloat) -> some View {
        ForEach(range.startHour...range.endHour, id: \.self) { hour in
            let y = range.yOffset(forHour: hour, height: height)

            Rectangle()
                .fill(Color.themeBorder.opacity(hour == range.startHour ? 0.35 : 0.22))
                .frame(height: 1)
                .offset(y: y)
        }
    }

    private func columnFill(isToday: Bool, isPlanned: Bool) -> Color {
        if !isPlanned {
            return Color.themeBorder.opacity(isToday ? 0.10 : 0.07)
        }

        if isToday {
            return Color.themeAccent.opacity(0.075)
        }

        return index.isMultiple(of: 2)
            ? Color.themePanel.opacity(0.38)
            : Color.themePanel.opacity(0.22)
    }
}

private struct DiagonalStripes: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let spacing: CGFloat = 12
        var x = -rect.height

        while x < rect.width {
            path.move(to: CGPoint(x: x, y: rect.maxY))
            path.addLine(to: CGPoint(x: x + rect.height, y: rect.minY))
            x += spacing
        }

        return path
    }
}

private struct TimelineSessionBlock: View {
    let slice: WorkSlice

    var body: some View {
        RoundedRectangle(cornerRadius: 7, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [
                        Color.themeAccent,
                        Color.themeAccent.opacity(0.72)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(alignment: .leading) {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .stroke(Color.white.opacity(0.24), lineWidth: 1)
            }
            .shadow(color: Color.themeAccent.opacity(0.18), radius: 6, y: 2)
            .accessibilityLabel(
                "Work session from \(slice.startedAt.formatted(date: .omitted, time: .shortened)) to \(slice.endedAt.formatted(date: .omitted, time: .shortened))"
            )
    }
}

private struct TimeRuler: View {
    let range: TimelineRange

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topTrailing) {
                ForEach(range.startHour...range.endHour, id: \.self) { hour in
                    Text(range.label(forHour: hour))
                        .font(.system(size: 10, weight: .medium, design: .rounded))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .offset(y: range.yOffset(forHour: hour, height: proxy.size.height) - 7)
                }
            }
            .padding(.trailing, 8)
        }
    }
}

private struct TimelineRange: Equatable {
    private static let fixedHeight: CGFloat = 680

    let startHour: Int
    let endHour: Int

    init(slices: [WorkSlice], stewardCalendar: StewardCalendar) {
        guard !slices.isEmpty else {
            self.startHour = 8
            self.endHour = 18
            return
        }

        let startFractions = slices.map {
            TimelineRange.hourFraction($0.startedAt, dayStart: stewardCalendar.startOfDay(for: $0.startedAt))
        }
        let endFractions = slices.map {
            TimelineRange.hourFraction($0.endedAt, dayStart: stewardCalendar.startOfDay(for: $0.startedAt))
        }
        let minStart = startFractions.min() ?? 8
        let maxEnd = endFractions.max() ?? 18
        let startHour = max(0, Int(floor(minStart)))
        let endHour = min(24, Int(ceil(maxEnd)))

        self.startHour = startHour
        self.endHour = max(startHour + 1, endHour)
    }

    var hourSpan: Int {
        max(1, endHour - startHour)
    }

    var height: CGFloat {
        Self.fixedHeight
    }

    func yOffset(for date: Date, dayStart: Date, height: CGFloat) -> CGFloat {
        let hour = Self.hourFraction(date, dayStart: dayStart)
        let fraction = (hour - Double(startHour)) / Double(hourSpan)
        return max(0, min(1, fraction)) * height
    }

    func yOffset(forHour hour: Int, height: CGFloat) -> CGFloat {
        let fraction = Double(hour - startHour) / Double(hourSpan)
        return max(0, min(1, fraction)) * height
    }

    func label(forHour hour: Int) -> String {
        let normalized = hour % 24
        let hour12 = normalized % 12 == 0 ? 12 : normalized % 12
        let suffix = normalized < 12 ? "AM" : "PM"
        return "\(hour12) \(suffix)"
    }

    private static func hourFraction(_ date: Date, dayStart: Date) -> Double {
        date.timeIntervalSince(dayStart) / 3600
    }
}

private struct EditableSessionRow: View {
    let session: WorkSession
    var model: StewardModel
    @State private var startedAt: Date
    @State private var endedAt: Date

    init(session: WorkSession, model: StewardModel) {
        self.session = session
        self.model = model
        _startedAt = State(initialValue: session.startedAt)
        _endedAt = State(initialValue: session.endedAt ?? model.now)
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(session.startedAt, format: .dateTime.weekday(.abbreviated).month(.abbreviated).day())
                    .font(.headline)

                Text(session.isActive ? "Active session" : TimeFormatting.hoursMinutes(session.duration(through: model.now)))
                    .font(.caption)
                    .foregroundStyle(session.isActive ? Color.themeGreen : Color.themeMuted)
            }
            .frame(width: 132, alignment: .leading)

            DatePicker(
                "Start",
                selection: Binding(
                    get: { startedAt },
                    set: { newValue in
                        startedAt = newValue
                        persist(startedAt: newValue, endedAt: session.isActive ? nil : endedAt)
                    }
                )
            )
            .datePickerStyle(.field)
            .labelsHidden()

            if session.isActive {
                Text("running")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(width: 120)
            } else {
                DatePicker(
                    "End",
                    selection: Binding(
                        get: { endedAt },
                        set: { newValue in
                            endedAt = newValue
                            persist(startedAt: startedAt, endedAt: newValue)
                        }
                    )
                )
                .datePickerStyle(.field)
                .labelsHidden()
            }

            Spacer()

            Button(role: .destructive) {
                model.deleteSession(id: session.id)
            } label: {
                Image(systemName: "trash")
            }
            .help("Delete session")
        }
        .padding(12)
        .background(Color.themePanel.opacity(0.68), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(Color.themeBorder.opacity(0.35), lineWidth: 1)
        }
        .onChange(of: session.startedAt) { _, newValue in
            startedAt = newValue
        }
        .onChange(of: session.endedAt) { _, newValue in
            endedAt = newValue ?? model.now
        }
    }

    private func persist(startedAt: Date, endedAt: Date?) {
        let didUpdate = model.updateSession(
            id: session.id,
            startedAt: startedAt,
            endedAt: endedAt
        )

        guard !didUpdate else {
            return
        }

        self.startedAt = session.startedAt
        self.endedAt = session.endedAt ?? model.now
    }
}
