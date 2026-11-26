import ApplicationServices
import CoreGraphics
import FocalCore

/// The few Accessibility calls Focal needs, on one app's windows.
enum Window {
  /// The app's focused standard window, or its main one, or its first one.
  static func main(of pid: pid_t) -> AXUIElement? {
    let app = AXUIElementCreateApplication(pid)
    for attribute in [kAXFocusedWindowAttribute, kAXMainWindowAttribute] {
      if let window = element(app, attribute), isStandard(window) { return window }
    }
    return windows(app).first(where: isStandard)
  }

  /// All the app's standard windows.
  static func standard(of pid: pid_t) -> [AXUIElement] {
    windows(AXUIElementCreateApplication(pid)).filter(isStandard)
  }

  static func move(_ window: AXUIElement, to origin: CGPoint) {
    set(window, kAXPositionAttribute, origin)
  }

  static func frame(of window: AXUIElement) -> CGRect? {
    guard let origin = point(window, kAXPositionAttribute), let size = size(of: window) else {
      return nil
    }
    return CGRect(origin: origin, size: size)
  }

  /// Moves the window into `slot`, or centers it there at its own size if it
  /// won't take the slot's size.
  static func place(_ window: AXUIElement, in slot: CGRect) {
    if bool(window, "AXFullScreen") == true { return }
    // Move first so the size isn't clamped to the display it's leaving.
    set(window, kAXPositionAttribute, slot.origin)
    set(window, kAXSizeAttribute, slot.size)
    if let actual = size(of: window),
      abs(actual.width - slot.width) > 2 || abs(actual.height - slot.height) > 2
    {
      set(window, kAXPositionAttribute, Geometry.center(actual, in: slot).origin)
    } else {
      set(window, kAXPositionAttribute, slot.origin)
    }
  }

  private static func isStandard(_ window: AXUIElement) -> Bool {
    string(window, kAXSubroleAttribute) == kAXStandardWindowSubrole
      && bool(window, kAXMinimizedAttribute) != true
  }

  private static func windows(_ app: AXUIElement) -> [AXUIElement] {
    guard let value = copy(app, kAXWindowsAttribute), let array = value as? [AnyObject] else {
      return []
    }
    return array.compactMap { item in
      CFGetTypeID(item) == AXUIElementGetTypeID() ? (item as! AXUIElement) : nil
    }
  }

  private static func size(of window: AXUIElement) -> CGSize? {
    guard let value = axValue(window, kAXSizeAttribute) else { return nil }
    var size = CGSize.zero
    return AXValueGetValue(value, .cgSize, &size) ? size : nil
  }

  private static func point(_ element: AXUIElement, _ attribute: String) -> CGPoint? {
    guard let value = axValue(element, attribute) else { return nil }
    var point = CGPoint.zero
    return AXValueGetValue(value, .cgPoint, &point) ? point : nil
  }

  private static func set(_ window: AXUIElement, _ attribute: String, _ point: CGPoint) {
    var point = point
    guard let value = AXValueCreate(.cgPoint, &point) else { return }
    AXUIElementSetAttributeValue(window, attribute as CFString, value)
  }

  private static func set(_ window: AXUIElement, _ attribute: String, _ size: CGSize) {
    var size = size
    guard let value = AXValueCreate(.cgSize, &size) else { return }
    AXUIElementSetAttributeValue(window, attribute as CFString, value)
  }

  private static func copy(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else {
      return nil
    }
    return value
  }

  private static func element(_ element: AXUIElement, _ attribute: String) -> AXUIElement? {
    guard let value = copy(element, attribute), CFGetTypeID(value) == AXUIElementGetTypeID() else {
      return nil
    }
    return (value as! AXUIElement)
  }

  private static func axValue(_ element: AXUIElement, _ attribute: String) -> AXValue? {
    guard let value = copy(element, attribute), CFGetTypeID(value) == AXValueGetTypeID() else {
      return nil
    }
    return (value as! AXValue)
  }

  private static func string(_ element: AXUIElement, _ attribute: String) -> String? {
    copy(element, attribute) as? String
  }

  private static func bool(_ element: AXUIElement, _ attribute: String) -> Bool? {
    copy(element, attribute) as? Bool
  }
}
