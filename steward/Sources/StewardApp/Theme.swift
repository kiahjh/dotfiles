import AppKit
import CoreServices
import Observation
import SwiftUI

/// The colors of the current dotfiles theme, from `~/.local/share/themes/current/palette.json`.
/// `theme` relinks `current` when it switches and replaces the files when it rebuilds, so Steward
/// watches the whole store and reloads on any change. Without a theme, Steward uses system colors.
@MainActor
@Observable
final class Theme {
    static let shared = Theme()

    struct Palette: Equatable {
        var background: NSColor
        var panel: NSColor
        var foreground: NSColor
        var muted: NSColor
        var border: NSColor
        var accent: NSColor
        var green: NSColor
        var purple: NSColor
        var red: NSColor
    }

    private(set) var palette: Palette?

    private static let store = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".local/share/themes", isDirectory: true)

    @ObservationIgnored private var stream: FSEventStreamRef?

    private init() {
        palette = Self.load()
        watch()
    }

    private func reload() {
        let palette = Self.load()
        if palette != self.palette {
            self.palette = palette
        }
    }

    private static func load() -> Palette? {
        let url = store.appendingPathComponent("current/palette.json")
        guard let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        func color(_ key: String) -> NSColor? {
            (json[key] as? String).flatMap(NSColor.init(hex:))
        }

        guard let background = color("background"),
              let panel = color("panel"),
              let foreground = color("foreground"),
              let muted = color("muted"),
              let border = color("border"),
              let accent = color("accent"),
              let green = color("green"),
              let purple = color("purple"),
              let red = color("red") else {
            return nil
        }

        return Palette(
            background: background, panel: panel, foreground: foreground, muted: muted,
            border: border, accent: accent, green: green, purple: purple, red: red
        )
    }

    private func watch() {
        let callback: FSEventStreamCallback = { _, _, _, _, _, _ in
            MainActor.assumeIsolated {
                Theme.shared.reload()
            }
        }
        var context = FSEventStreamContext()
        guard let stream = FSEventStreamCreate(
            nil,
            callback,
            &context,
            [Self.store.path] as CFArray,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            0.3,
            FSEventStreamCreateFlags(kFSEventStreamCreateFlagNoDefer)
        ) else {
            return
        }
        FSEventStreamSetDispatchQueue(stream, .main)
        FSEventStreamStart(stream)
        self.stream = stream
    }
}

/// Calls `apply` now and again whenever the theme changes.
@MainActor
func followTheme(_ apply: @escaping @MainActor () -> Void) {
    withObservationTracking {
        apply()
    } onChange: {
        Task { @MainActor in
            followTheme(apply)
        }
    }
}

@MainActor
extension NSColor {
    static var themeAccent: NSColor { Theme.shared.palette?.accent ?? .controlAccentColor }
    static var themeBackground: NSColor { Theme.shared.palette?.background ?? .windowBackgroundColor }

    convenience init?(hex: String) {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else {
            return nil
        }
        self.init(
            srgbRed: CGFloat((value >> 16) & 0xff) / 255,
            green: CGFloat((value >> 8) & 0xff) / 255,
            blue: CGFloat(value & 0xff) / 255,
            alpha: 1
        )
    }
}

@MainActor
extension Color {
    private static func theme(_ key: KeyPath<Theme.Palette, NSColor>, or fallback: NSColor) -> Color {
        Color(nsColor: Theme.shared.palette?[keyPath: key] ?? fallback)
    }

    static var themeAccent: Color { theme(\.accent, or: .controlAccentColor) }
    static var themeBackground: Color { theme(\.background, or: .windowBackgroundColor) }
    static var themePanel: Color { theme(\.panel, or: .controlBackgroundColor) }
    static var themeForeground: Color { theme(\.foreground, or: .labelColor) }
    static var themeMuted: Color { theme(\.muted, or: .secondaryLabelColor) }
    static var themeBorder: Color { theme(\.border, or: .separatorColor) }
    static var themeGreen: Color { theme(\.green, or: .systemGreen) }
    static var themePurple: Color { theme(\.purple, or: .systemPurple) }
    static var themeRed: Color { theme(\.red, or: .systemRed) }
}
