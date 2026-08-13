import XCTest

@testable import MercenaryKit

final class CameraTests: XCTestCase {
  private let size = CGSize(width: 800, height: 600)

  private func camera(heading: Double = 0, pitch: Double = 0) -> Camera {
    Camera(position: SIMD3(0, 0, 0), heading: heading, pitch: pitch)
  }

  func testAPointStraightAheadLandsAtTheViewCentre() {
    let view = camera().viewSpace(SIMD3(0, 0, 1000))
    let point = camera().project(view, size: size)

    XCTAssertEqual(point.x, 400, accuracy: 0.001)
    XCTAssertEqual(point.y, 300, accuracy: 0.001)
  }

  func testForwardIsPositiveZAtHeadingZero() {
    XCTAssertEqual(camera().viewSpace(SIMD3(0, 0, 1000)).z, 1000, accuracy: 0.001)
  }

  func testAPointToTheRightProjectsRightOfCentre() {
    let camera = camera()
    let point = camera.project(camera.viewSpace(SIMD3(100, 0, 1000)), size: size)

    XCTAssertGreaterThan(point.x, 400)
  }

  func testAPointAboveProjectsAboveCentre() {
    let camera = camera()
    let point = camera.project(camera.viewSpace(SIMD3(0, 100, 1000)), size: size)

    // Screen coordinates grow downward.
    XCTAssertLessThan(point.y, 300)
  }

  func testTurningAQuarterTurnBringsPositiveXInFront() {
    let view = camera(heading: .pi / 2).viewSpace(SIMD3(1000, 0, 0))

    XCTAssertEqual(view.z, 1000, accuracy: 0.001)
    XCTAssertEqual(view.x, 0, accuracy: 0.001)
  }

  func testASegmentEntirelyBehindTheCameraIsDropped() {
    let camera = camera()

    XCTAssertNil(camera.project(segment: Segment(a: SIMD3(0, 0, -100), b: SIMD3(0, 0, -50), ink: .white), size: size))
  }

  func testASegmentCrossingTheNearPlaneIsClippedNotDropped() throws {
    let camera = camera()
    let line = try XCTUnwrap(
      camera.project(segment: Segment(a: SIMD3(0, 0, -100), b: SIMD3(0, 0, 1000), ink: .white), size: size)
    )

    XCTAssertTrue(line.x1.isFinite && line.y1.isFinite)
    XCTAssertTrue(line.x2.isFinite && line.y2.isFinite)
  }

  func testClippingKeepsTheVisibleEndpointUntouched() throws {
    let camera = camera()
    let clipped = try XCTUnwrap(camera.clipToNearPlane(SIMD3(0, 0, -100), SIMD3(0, 0, 1000)))

    XCTAssertEqual(clipped.1.z, 1000, accuracy: 0.001)
    XCTAssertEqual(clipped.0.z, camera.nearPlane, accuracy: 0.001)
  }

  func testClippingIsSymmetricInEndpointOrder() throws {
    let camera = camera()
    let forward = try XCTUnwrap(camera.clipToNearPlane(SIMD3(0, 0, -100), SIMD3(0, 0, 1000)))
    let reversed = try XCTUnwrap(camera.clipToNearPlane(SIMD3(0, 0, 1000), SIMD3(0, 0, -100)))

    XCTAssertEqual(forward.0.z, camera.nearPlane, accuracy: 0.001)
    XCTAssertEqual(reversed.1.z, camera.nearPlane, accuracy: 0.001)
  }

  func testDistanceShrinksApparentSize() {
    let camera = camera()
    func width(atDepth depth: Double) -> Double {
      let left = camera.project(camera.viewSpace(SIMD3(-100, 0, Float(depth))), size: size)
      let right = camera.project(camera.viewSpace(SIMD3(100, 0, Float(depth))), size: size)
      return right.x - left.x
    }

    XCTAssertGreaterThan(width(atDepth: 500), width(atDepth: 5000))
  }

  func testACameraBuiltFromAPlayerAdoptsItsPose() {
    let player = PlayerState(position: SIMD3(1, 2, 3), heading: 0.5, pitch: -0.25)
    let camera = Camera(player: player)

    XCTAssertEqual(camera.position, player.position)
    XCTAssertEqual(camera.heading, player.heading)
    XCTAssertEqual(camera.pitch, player.pitch)
  }

  func testPitchingUpMovesDistantGeometryDownTheScreen() {
    let level = camera(pitch: 0)
    let raised = camera(pitch: 0.4)
    let target = SIMD3<Float>(0, 0, 10_000)

    let levelPoint = level.project(level.viewSpace(target), size: size)
    let raisedPoint = raised.project(raised.viewSpace(target), size: size)

    XCTAssertGreaterThan(raisedPoint.y, levelPoint.y)
  }
}
