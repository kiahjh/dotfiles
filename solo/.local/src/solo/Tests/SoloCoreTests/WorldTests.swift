import SoloCore
import XCTest

private let a: AppID = 1
private let b: AppID = 2
private let c: AppID = 3
private let d: AppID = 4
private let main: DisplayID = 10
private let side: DisplayID = 20

final class WorldTests: XCTestCase {
  func testSwitchingReplacesTheSoloApp() {
    var world = World()
    world.activate(a, on: main)
    world.activate(b, on: main)

    XCTAssertEqual(world.layouts[main], .solo(b))
    XCTAssertEqual(world.plan(for: main), Plan(shown: [Placement(app: b, slot: .full)], hidden: [a]))
  }

  func testPairModePairsWithThePreviousAppOnThatDisplay() {
    var world = World()
    world.activate(a, on: main)
    world.activate(c, on: side)
    world.activate(b, on: main)

    XCTAssertTrue(world.togglePair(on: main))
    XCTAssertEqual(world.layouts[main], .pair(left: b, right: a, active: .left))
    XCTAssertEqual(world.plan(for: main).hidden, [])
  }

  func testPairModeNeedsAPreviousApp() {
    var world = World()
    world.activate(a, on: main)

    XCTAssertFalse(world.togglePair(on: main))
    XCTAssertEqual(world.layouts[main], .solo(a))
  }

  func testSwitchingWithinAPairChangesTheActiveSide() {
    var world = pair()
    world.activate(b, on: main)

    XCTAssertEqual(world.layouts[main], .pair(left: a, right: b, active: .right))
  }

  func testAThirdAppReplacesTheActiveSide() {
    var world = pair()
    world.activate(c, on: main)
    XCTAssertEqual(world.layouts[main], .pair(left: c, right: b, active: .left))
    XCTAssertEqual(world.plan(for: main).hidden, [a])

    world.activate(b, on: main)
    world.activate(d, on: main)
    XCTAssertEqual(world.layouts[main], .pair(left: c, right: d, active: .right))
  }

  func testPairModeOffKeepsTheActiveApp() {
    var world = pair()
    world.activate(b, on: main)

    XCTAssertTrue(world.togglePair(on: main))
    XCTAssertEqual(world.layouts[main], .solo(b))
    XCTAssertEqual(world.plan(for: main).hidden, [a])
  }

  func testSwapTradesSides() {
    var world = pair()

    XCTAssertTrue(world.swap(on: main))
    XCTAssertEqual(world.layouts[main], .pair(left: b, right: a, active: .right))
  }

  func testDisplaysAreIndependent() {
    var world = World()
    world.activate(a, on: main)
    world.activate(b, on: side)
    world.activate(c, on: main)

    XCTAssertEqual(world.layouts[side], .solo(b))
    XCTAssertEqual(world.plan(for: main).hidden, [a])
    XCTAssertEqual(world.plan(for: side).hidden, [])
  }

  func testMovingAnAppShowsThePreviousOneWhereItLeft() {
    var world = World()
    world.activate(a, on: main)
    world.activate(b, on: main)
    world.activate(c, on: side)
    world.activate(b, on: main)

    XCTAssertEqual(world.activate(b, on: side), [main, side])
    XCTAssertEqual(world.layouts[main], .solo(a))
    XCTAssertEqual(world.layouts[side], .solo(b))
    XCTAssertEqual(world.plan(for: side).hidden, [c])
  }

  func testMovingOutOfAPairLeavesThePartnerSolo() {
    var world = pair()
    world.activate(a, on: side)

    XCTAssertEqual(world.layouts[main], .solo(b))
  }

  func testQuittingAPairedAppLeavesThePartnerSolo() {
    var world = pair()

    XCTAssertEqual(world.remove(b), [main])
    XCTAssertEqual(world.layouts[main], .solo(a))
  }

  func testQuittingTheSoloAppShowsThePreviousOne() {
    var world = World()
    world.activate(a, on: main)
    world.activate(b, on: main)
    world.remove(b)

    XCTAssertEqual(world.layouts[main], .solo(a))
  }

  func testAnUntouchedDisplayIsLeftAlone() {
    var world = World()
    world.locate(a, on: side)
    world.locate(b, on: side)

    XCTAssertEqual(world.plan(for: side), Plan(shown: [], hidden: []))
  }

  func testLocatedAppsHideOnceTheirDisplayIsUsed() {
    var world = World()
    world.locate(a, on: main)
    world.locate(b, on: side)
    world.activate(c, on: main)

    XCTAssertEqual(world.plan(for: main).hidden, [a])
  }

  /// a | b on the main display, with a active.
  private func pair() -> World {
    var world = World()
    world.activate(b, on: main)
    world.activate(a, on: main)
    XCTAssertTrue(world.togglePair(on: main))
    XCTAssertEqual(world.layouts[main], .pair(left: a, right: b, active: .left))
    return world
  }
}
