public typealias AppID = Int32
public typealias DisplayID = UInt32

public enum Side: Equatable {
  case left, right
}

public enum Slot: Equatable {
  case full, left, right
}

/// What one display shows: one app, or two side by side.
public enum Layout: Equatable {
  case solo(AppID)
  case pair(left: AppID, right: AppID, active: Side)

  public var apps: [AppID] {
    switch self {
    case let .solo(app): return [app]
    case let .pair(left, right, _): return [left, right]
    }
  }

  public var active: AppID {
    switch self {
    case let .solo(app): return app
    case let .pair(left, right, active): return active == .left ? left : right
    }
  }

  public var placements: [Placement] {
    switch self {
    case let .solo(app): return [Placement(app: app, slot: .full)]
    case let .pair(left, right, _):
      return [Placement(app: left, slot: .left), Placement(app: right, slot: .right)]
    }
  }
}

public struct Placement: Equatable {
  public let app: AppID
  public let slot: Slot

  public init(app: AppID, slot: Slot) {
    self.app = app
    self.slot = slot
  }
}

/// What a display should look like: these apps shown in these slots, and
/// every other app that lives there hidden.
public struct Plan: Equatable {
  public let shown: [Placement]
  public let hidden: [AppID]

  public init(shown: [Placement], hidden: [AppID]) {
    self.shown = shown
    self.hidden = hidden
  }
}

/// Every display's layout, which display each app lives on, and the order
/// apps were last used in. Methods that change a layout return the displays
/// that need to be redrawn.
public struct World {
  public private(set) var layouts: [DisplayID: Layout] = [:]
  public private(set) var homes: [AppID: DisplayID] = [:]
  /// Most recently used first.
  public private(set) var recent: [AppID] = []

  public init() {}

  /// Records where an app's window is without changing any layout.
  public mutating func locate(_ app: AppID, on display: DisplayID) {
    homes[app] = display
    if !recent.contains(app) { recent.append(app) }
  }

  /// The app became active with its window on `display`. It shows there,
  /// replacing the solo app or the pair's active side.
  @discardableResult
  public mutating func activate(_ app: AppID, on display: DisplayID) -> Set<DisplayID> {
    var changed: Set<DisplayID> = [display]
    if let old = homes[app], old != display, leave(app, old) { changed.insert(old) }
    homes[app] = display
    recent.removeAll { $0 == app }
    recent.insert(app, at: 0)

    switch layouts[display] {
    case let .pair(left, right, active):
      if app == left {
        layouts[display] = .pair(left: left, right: right, active: .left)
      } else if app == right {
        layouts[display] = .pair(left: left, right: right, active: .right)
      } else if active == .left {
        layouts[display] = .pair(left: app, right: right, active: .left)
      } else {
        layouts[display] = .pair(left: left, right: app, active: .right)
      }
    case .solo, nil:
      layouts[display] = .solo(app)
    }
    return changed
  }

  /// Solo becomes a pair with the app used just before on this display, on
  /// the right; a pair becomes its active app, solo.
  public mutating func togglePair(on display: DisplayID) -> Bool {
    switch layouts[display] {
    case let .solo(app):
      guard let previous = previous(on: display, excluding: app) else { return false }
      layouts[display] = .pair(left: app, right: previous, active: .left)
    case let layout?:
      layouts[display] = .solo(layout.active)
    case nil:
      return false
    }
    return true
  }

  public mutating func swap(on display: DisplayID) -> Bool {
    guard case let .pair(left, right, active) = layouts[display] else { return false }
    layouts[display] = .pair(left: right, right: left, active: active == .left ? .right : .left)
    return true
  }

  /// The app quit.
  @discardableResult
  public mutating func remove(_ app: AppID) -> Set<DisplayID> {
    recent.removeAll { $0 == app }
    guard let home = homes.removeValue(forKey: app) else { return [] }
    return leave(app, home) ? [home] : []
  }

  public func plan(for display: DisplayID) -> Plan {
    // A display nobody has switched to yet is left as it is.
    guard let layout = layouts[display] else { return Plan(shown: [], hidden: []) }
    let shown = layout.apps
    let hidden = recent.filter { homes[$0] == display && !shown.contains($0) }
    return Plan(shown: layout.placements, hidden: hidden)
  }

  /// Takes the app out of the display's layout. Its partner goes solo, or
  /// the app used before it there takes its place.
  private mutating func leave(_ app: AppID, _ display: DisplayID) -> Bool {
    guard let layout = layouts[display], layout.apps.contains(app) else { return false }
    switch layout {
    case .solo:
      layouts[display] = previous(on: display, excluding: app).map(Layout.solo)
    case let .pair(left, right, _):
      layouts[display] = .solo(left == app ? right : left)
    }
    return true
  }

  private func previous(on display: DisplayID, excluding app: AppID) -> AppID? {
    recent.first { $0 != app && homes[$0] == display }
  }
}
