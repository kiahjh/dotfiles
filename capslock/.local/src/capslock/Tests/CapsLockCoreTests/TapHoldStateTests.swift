import CapsLockCore
import XCTest

final class TapHoldStateTests: XCTestCase {
  func testQuickIsolatedPressProducesTap() {
    var state = TapHoldState(tapTimeoutMilliseconds: 200)

    state.triggerDown(at: milliseconds(1_000), eligibleForTap: true)

    XCTAssertEqual(state.triggerUp(at: milliseconds(1_150)), .tap)
    XCTAssertFalse(state.isTriggerDown)
  }

  func testPressAtTimeoutProducesTap() {
    var state = TapHoldState(tapTimeoutMilliseconds: 200)

    state.triggerDown(at: milliseconds(1_000), eligibleForTap: true)

    XCTAssertEqual(state.triggerUp(at: milliseconds(1_200)), .tap)
  }

  func testLongPressDoesNotProduceTap() {
    var state = TapHoldState(tapTimeoutMilliseconds: 200)

    state.triggerDown(at: milliseconds(1_000), eligibleForTap: true)

    XCTAssertNil(state.triggerUp(at: milliseconds(1_201)))
  }

  func testChordDoesNotProduceTap() {
    var state = TapHoldState(tapTimeoutMilliseconds: 200)

    state.triggerDown(at: milliseconds(1_000), eligibleForTap: true)
    state.interfere()

    XCTAssertNil(state.triggerUp(at: milliseconds(1_100)))
  }

  func testPressThatStartsDuringAnotherGestureIsNotATap() {
    var state = TapHoldState(tapTimeoutMilliseconds: 200)

    state.triggerDown(at: milliseconds(1_000), eligibleForTap: false)

    XCTAssertNil(state.triggerUp(at: milliseconds(1_050)))
  }

  func testInterferenceWhileTriggerIsUpDoesNotAffectNextTap() {
    var state = TapHoldState(tapTimeoutMilliseconds: 200)

    state.interfere()
    state.triggerDown(at: milliseconds(1_000), eligibleForTap: true)

    XCTAssertEqual(state.triggerUp(at: milliseconds(1_050)), .tap)
  }

  func testDuplicateDownDoesNotRestartTapWindow() {
    var state = TapHoldState(tapTimeoutMilliseconds: 200)

    state.triggerDown(at: milliseconds(1_000), eligibleForTap: true)
    state.triggerDown(at: milliseconds(1_150), eligibleForTap: true)

    XCTAssertNil(state.triggerUp(at: milliseconds(1_250)))
  }

  func testUnexpectedReleaseResetsState() {
    var state = TapHoldState(tapTimeoutMilliseconds: 200)

    XCTAssertNil(state.triggerUp(at: milliseconds(1_000)))
    state.triggerDown(at: milliseconds(1_100), eligibleForTap: true)

    XCTAssertEqual(state.triggerUp(at: milliseconds(1_150)), .tap)
  }

  func testTimestampMovingBackwardsDoesNotProduceTap() {
    var state = TapHoldState(tapTimeoutMilliseconds: 200)

    state.triggerDown(at: milliseconds(1_000), eligibleForTap: true)

    XCTAssertNil(state.triggerUp(at: milliseconds(999)))
  }

  func testResetCancelsPendingTap() {
    var state = TapHoldState(tapTimeoutMilliseconds: 200)

    state.triggerDown(at: milliseconds(1_000), eligibleForTap: true)
    state.reset()

    XCTAssertNil(state.triggerUp(at: milliseconds(1_050)))
  }

  private func milliseconds(_ value: UInt64) -> UInt64 {
    value * 1_000_000
  }
}
