public struct TapHoldState: Sendable {
  public enum Output: Equatable, Sendable {
    case tap
  }

  public private(set) var isTriggerDown = false

  private let tapTimeoutNanoseconds: UInt64
  private var pressedAt: UInt64?
  private var isTapCandidate = false

  public init(tapTimeoutMilliseconds: UInt64) {
    let (nanoseconds, overflow) = tapTimeoutMilliseconds.multipliedReportingOverflow(by: 1_000_000)
    self.tapTimeoutNanoseconds = overflow ? .max : nanoseconds
  }

  public mutating func triggerDown(at timestamp: UInt64, eligibleForTap: Bool) {
    guard !isTriggerDown else { return }

    isTriggerDown = true
    pressedAt = timestamp
    isTapCandidate = eligibleForTap
  }

  public mutating func interfere() {
    guard isTriggerDown else { return }
    isTapCandidate = false
  }

  public mutating func triggerUp(at timestamp: UInt64) -> Output? {
    guard isTriggerDown else {
      reset()
      return nil
    }

    defer { reset() }

    guard
      isTapCandidate,
      let pressedAt,
      timestamp >= pressedAt,
      timestamp - pressedAt <= tapTimeoutNanoseconds
    else {
      return nil
    }

    return .tap
  }

  public mutating func reset() {
    isTriggerDown = false
    pressedAt = nil
    isTapCandidate = false
  }
}
