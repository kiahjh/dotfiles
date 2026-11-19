import SwiftUI
import StewardCore

enum MenuPopoverLayout {
    static let width: CGFloat = 390
    static let edgeInset: CGFloat = 18
    static let quitBottomInset: CGFloat = 30
    static func height(hasIdleGap: Bool) -> CGFloat {
        hasIdleGap ? 262 : 166
    }
}

struct MenuPopoverView: View {
    var model: StewardModel
    let actions: MenuActions

    var body: some View {
        content
            .padding(.horizontal, MenuPopoverLayout.edgeInset)
            .padding(.top, MenuPopoverLayout.edgeInset)
            .padding(.bottom, MenuPopoverLayout.edgeInset)
            .frame(
                width: MenuPopoverLayout.width,
                height: MenuPopoverLayout.height(hasIdleGap: model.pendingIdleGap != nil),
                alignment: .topLeading
            )
            // The popover's content reaches into the arrow (hasFullSizeContent); fill all of it.
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.themeBackground, ignoresSafeAreaEdges: .all)
            .foregroundStyle(Color.themeForeground)
            .tint(Color.themeAccent)
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 16) {
            progressBlock

            if let gap = model.pendingIdleGap {
                IdleGapPromptView(gap: gap, model: model)
            }

            actionRow

            if let error = model.errorMessage {
                HStack(spacing: 8) {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(Color.themeRed)
                        .lineLimit(1)

                    Spacer()

                    Button("Dismiss") {
                        model.clearError()
                    }
                    .font(.caption)
                }
            }
        }
    }

    private var actionRow: some View {
        HStack(alignment: .center, spacing: 8) {
            Button {
                model.toggleTracking()
                actions.refreshStatus()
            } label: {
                Label(model.isTracking ? "Stop Tracking" : "Start Tracking", systemImage: model.isTracking ? "stop.fill" : "play.fill")
                    .lineLimit(1)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .layoutPriority(1)

            Button {
                actions.openHistory()
            } label: {
                Text("History")
                    .font(.caption)
                    .bold()
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 8)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .layoutPriority(2)

            Button {
                actions.quit()
            } label: {
                Text("Quit")
                    .font(.caption)
                    .bold()
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 8)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .layoutPriority(2)
        }
    }

    private var progressBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            ProgressReadout(title: "Today", line: model.pacingSnapshot.daily)
            ProgressReadout(title: "Week", line: model.pacingSnapshot.weekly)
        }
        .padding(14)
        .background(Color.themePanel, in: RoundedRectangle(cornerRadius: 8))
    }
}

private struct ProgressReadout: View {
    let title: String
    let line: ProgressLine

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Text("\(line.workedLabel) \(line.remainingLabel)")
                    .font(.system(.caption, design: .monospaced, weight: .medium))
                    .foregroundStyle(.primary)
            }

            ClippedProgressBar(fraction: line.fraction)
        }
    }
}

private struct ClippedProgressBar: View {
    let fraction: Double

    var body: some View {
        GeometryReader { proxy in
            let width = max(0, min(1, fraction)) * proxy.size.width

            RoundedRectangle(cornerRadius: 3.5, style: .continuous)
                .fill(.quaternary)
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(Color.themeAccent)
                        .frame(width: width)
                }
                .clipShape(RoundedRectangle(cornerRadius: 3.5, style: .continuous))
        }
        .frame(height: 7)
    }
}

private struct IdleGapPromptView: View {
    let gap: IdleGap
    var model: StewardModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Idle gap detected")
                .font(.headline)

            Text("\(gap.startedAt, format: .dateTime.hour().minute())-\(gap.endedAt, format: .dateTime.hour().minute())")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack {
                Button("Keep") {
                    model.resolvePendingGap(.keep)
                }

                Button("Trim") {
                    model.resolvePendingGap(.trimAndContinue)
                }

                Button("Stop There") {
                    model.resolvePendingGap(.stopAtGapStart)
                }
            }
            .buttonStyle(.bordered)
        }
        .padding(12)
        .background(Color.themePanel, in: RoundedRectangle(cornerRadius: 8))
    }
}
