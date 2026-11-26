import CoreGraphics

/// Frame math. Rects use Accessibility coordinates: the origin is the top
/// left of the primary display, and y grows downward.
public enum Geometry {
  /// The slot's frame in a display's usable area, `gap` from every edge and
  /// from the other half of a pair.
  public static func frame(for slot: Slot, in area: CGRect, gap: CGFloat) -> CGRect {
    let inner = area.insetBy(dx: gap, dy: gap)
    let half = ((inner.width - gap) / 2).rounded(.down)
    switch slot {
    case .full:
      return inner.integral
    case .left:
      return CGRect(x: inner.minX, y: inner.minY, width: half, height: inner.height).integral
    case .right:
      return CGRect(x: inner.maxX - half, y: inner.minY, width: half, height: inner.height).integral
    }
  }

  /// A window that can't take the slot's size, centered in it. If it's larger
  /// than the slot it starts at the slot's top left, so its title bar stays
  /// reachable.
  public static func center(_ size: CGSize, in slot: CGRect) -> CGRect {
    let x = slot.minX + max(0, (slot.width - size.width) / 2)
    let y = slot.minY + max(0, (slot.height - size.height) / 2)
    return CGRect(origin: CGPoint(x: x, y: y), size: size).integral
  }

  /// Where a window goes to be out of sight without hiding its app: past the
  /// display's bottom right corner with 1pt still on it, or past the bottom
  /// left if that would put it on another display.
  public static func parked(_ size: CGSize, on display: CGRect, among displays: [CGRect]) -> CGRect {
    let right = CGRect(origin: CGPoint(x: display.maxX - 1, y: display.maxY - 1), size: size)
    let left = CGRect(
      origin: CGPoint(x: display.minX - size.width + 1, y: display.maxY - 1), size: size)
    let others = displays.filter { $0 != display }
    return others.contains(where: { $0.intersects(right) }) ? left : right
  }

  /// Converts a Cocoa rect (origin bottom left of the primary display, y up).
  public static func flipped(_ rect: CGRect, primaryHeight: CGFloat) -> CGRect {
    CGRect(x: rect.minX, y: primaryHeight - rect.maxY, width: rect.width, height: rect.height)
  }

  /// The display holding the window's center, or failing that the one it
  /// overlaps most.
  public static func display(of window: CGRect, among displays: [(DisplayID, CGRect)]) -> DisplayID? {
    let center = CGPoint(x: window.midX, y: window.midY)
    if let hit = displays.first(where: { $0.1.contains(center) }) { return hit.0 }
    let overlaps = displays.map { ($0.0, $0.1.intersection(window)) }.filter { !$0.1.isNull }
    return overlaps.max { $0.1.width * $0.1.height < $1.1.width * $1.1.height }?.0
  }
}
