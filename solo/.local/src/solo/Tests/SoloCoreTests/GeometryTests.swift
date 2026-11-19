import CoreGraphics
import SoloCore
import XCTest

final class GeometryTests: XCTestCase {
  // A 1512×982 display with a 33pt menu bar and no Dock.
  private let area = CGRect(x: 0, y: 33, width: 1512, height: 949)

  func testSoloIsInsetByTheGap() {
    XCTAssertEqual(
      Geometry.frame(for: .full, in: area, gap: 24),
      CGRect(x: 24, y: 57, width: 1464, height: 901)
    )
  }

  func testPairHalvesShareTheGap() {
    let left = Geometry.frame(for: .left, in: area, gap: 24)
    let right = Geometry.frame(for: .right, in: area, gap: 24)

    XCTAssertEqual(left, CGRect(x: 24, y: 57, width: 720, height: 901))
    XCTAssertEqual(right, CGRect(x: 768, y: 57, width: 720, height: 901))
    XCTAssertEqual(right.minX - left.maxX, 24)
  }

  func testFixedSizeWindowsAreCentered() {
    let slot = CGRect(x: 24, y: 57, width: 1464, height: 901)

    XCTAssertEqual(
      Geometry.center(CGSize(width: 664, height: 501), in: slot),
      CGRect(x: 424, y: 257, width: 664, height: 501)
    )
    XCTAssertEqual(
      Geometry.center(CGSize(width: 2000, height: 501), in: slot).origin,
      CGPoint(x: 24, y: 257)
    )
  }

  func testFlippingFromCocoa() {
    // A display above the primary one, and the primary's visible frame.
    XCTAssertEqual(
      Geometry.flipped(CGRect(x: 0, y: 982, width: 1920, height: 1080), primaryHeight: 982),
      CGRect(x: 0, y: -1080, width: 1920, height: 1080)
    )
    XCTAssertEqual(
      Geometry.flipped(CGRect(x: 0, y: 0, width: 1512, height: 949), primaryHeight: 982),
      area
    )
  }

  func testDisplayOfAWindow() {
    let displays: [(DisplayID, CGRect)] = [
      (1, CGRect(x: 0, y: 0, width: 1512, height: 982)),
      (2, CGRect(x: 1512, y: 0, width: 1920, height: 1080)),
    ]

    XCTAssertEqual(Geometry.display(of: CGRect(x: 1400, y: 100, width: 600, height: 400), among: displays), 2)
    XCTAssertEqual(Geometry.display(of: CGRect(x: 100, y: 900, width: 600, height: 400), among: displays), 1)
    XCTAssertNil(Geometry.display(of: CGRect(x: 9000, y: 9000, width: 10, height: 10), among: displays))
  }
}
