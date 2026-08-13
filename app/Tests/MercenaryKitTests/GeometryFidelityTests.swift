import XCTest

@testable import MercenaryKit

final class OrientationTests: XCTestCase {
  func testIdentityLeavesAVertexAlone() {
    let vertex = SIMD3<Float>(100, 200, 300)

    XCTAssertEqual(Orientation.identity.apply(to: vertex), vertex)
  }

  func testAFullTurnOnEveryAxisIsIdentity() {
    let vertex = SIMD3<Float>(100, 200, 300)
    let turned = Orientation(z: 256, x: 256, y: 256).apply(to: vertex)

    XCTAssertEqual(turned.x, vertex.x, accuracy: 0.01)
    XCTAssertEqual(turned.y, vertex.y, accuracy: 0.01)
    XCTAssertEqual(turned.z, vertex.z, accuracy: 0.01)
  }

  func testAQuarterTurnAboutZMapsXOntoY() {
    let turned = Orientation(z: 64, x: 0, y: 0).apply(to: SIMD3(100, 0, 0))

    XCTAssertEqual(turned.x, 0, accuracy: 0.01)
    XCTAssertEqual(turned.y, 100, accuracy: 0.01)
    XCTAssertEqual(turned.z, 0, accuracy: 0.01)
  }

  func testAQuarterTurnAboutXMapsYOntoZ() {
    let turned = Orientation(z: 0, x: 64, y: 0).apply(to: SIMD3(0, 100, 0))

    XCTAssertEqual(turned.y, 0, accuracy: 0.01)
    XCTAssertEqual(turned.z, 100, accuracy: 0.01)
  }

  func testAQuarterTurnAboutYMapsZOntoX() {
    let turned = Orientation(z: 0, x: 0, y: 64).apply(to: SIMD3(0, 0, 100))

    XCTAssertEqual(turned.z, 0, accuracy: 0.01)
    XCTAssertEqual(turned.x, 100, accuracy: 0.01)
  }

  func testRotationPreservesLength() {
    let vertex = SIMD3<Float>(120, -340, 517)
    let turned = Orientation(z: 37, x: 91, y: 203).apply(to: vertex)

    XCTAssertEqual(
      (turned.x * turned.x + turned.y * turned.y + turned.z * turned.z).squareRoot(),
      (vertex.x * vertex.x + vertex.y * vertex.y + vertex.z * vertex.z).squareRoot(),
      accuracy: 0.05
    )
  }

  func testBytesBeyondAFullTurnWrap() {
    let once = Orientation(z: 40, x: 0, y: 0).apply(to: SIMD3(100, 50, 0))
    let wrapped = Orientation(z: 40 + 256, x: 0, y: 0).apply(to: SIMD3(100, 50, 0))

    XCTAssertEqual(once.x, wrapped.x, accuracy: 0.01)
    XCTAssertEqual(once.y, wrapped.y, accuracy: 0.01)
  }

  func testBuildingFromBytesTakesZThenXThenY() {
    let orientation = Orientation(bytes: [1, 2, 3])

    XCTAssertEqual(orientation, Orientation(z: 1, x: 2, y: 3))
    XCTAssertNil(Orientation(bytes: [1, 2]))
    XCTAssertNil(Orientation(bytes: nil))
  }

  func testIsIdentityIgnoresWholeTurns() {
    XCTAssertTrue(Orientation(z: 256, x: 512, y: 0).isIdentity)
    XCTAssertFalse(Orientation(z: 1, x: 0, y: 0).isIdentity)
  }
}

final class ReferenceViewportTests: XCTestCase {
  func testScalePreservesTheOriginalAspect() {
    let wide = ReferenceViewport(size: CGSize(width: 1600, height: 400))

    // Limited by height: 400 / 136.
    XCTAssertEqual(wide.scale, 400 / 136, accuracy: 0.0001)
  }

  func testCentreIsTheMiddleOfTheView() {
    let viewport = ReferenceViewport(size: CGSize(width: 800, height: 600))

    XCTAssertEqual(viewport.centre.x, 400)
    XCTAssertEqual(viewport.centre.y, 300)
  }

  func testFieldOfViewIsIndependentOfWindowSize() {
    let small = ReferenceViewport(size: CGSize(width: 320, height: 272))
    let large = ReferenceViewport(size: CGSize(width: 1920, height: 1632))

    XCTAssertEqual(small.verticalFieldOfView, large.verticalFieldOfView, accuracy: 1e-12)
  }

  func testAPointSubtendsTheSameAngleAtAnyWindowSize() {
    let camera = Camera(position: .zero, heading: 0, pitch: 0)
    func fraction(_ size: CGSize) -> Double {
      let point = camera.project(camera.viewSpace(SIMD3(100, 0, 1000)), size: size)
      return (point.x - Double(size.width) / 2) / (ReferenceViewport(size: size).scale)
    }

    XCTAssertEqual(
      fraction(CGSize(width: 640, height: 544)),
      fraction(CGSize(width: 1280, height: 1088)),
      accuracy: 0.0001
    )
  }
}

final class DetailAndRoadTests: XCTestCase {
  private func placement(origin: SIMD3<Float>, cube: Float = 65536, point: Bool = true) -> ObjectPlacement {
    ObjectPlacement(
      slot: 0, id: "object-instance:00", model: "m", origin: origin,
      vertices: [SIMD3(0, 0, 0), SIMD3(1, 0, 0)], edges: [(0, 1)],
      detailCube: cube, drawsFarAsPoint: point, orientation: .identity,
      placement: "surface", withinWorld: true, room: 0, stateFlags: 0
    )
  }

  func testAnObjectInsideTheCubeIsDetailed() {
    let object = placement(origin: SIMD3(1000, 0, 1000))

    XCTAssertTrue(object.isDetailed(from: SIMD3(0, 0, 0)))
  }

  func testTheCubeIsPerAxisNotRadial() {
    let object = placement(origin: SIMD3(65000, 0, 65000))

    // Radially this is well beyond the cube, but every axis is inside it.
    XCTAssertTrue(object.isDetailed(from: SIMD3(0, 0, 0)))
  }

  func testOneAxisBeyondTheCubeIsEnoughToReduceIt() {
    let object = placement(origin: SIMD3(0, 0, 65537))

    XCTAssertFalse(object.isDetailed(from: SIMD3(0, 0, 0)))
  }

  func testHeightCountsTowardTheCube() {
    let object = placement(origin: SIMD3(0, 70000, 0))

    XCTAssertFalse(object.isDetailed(from: SIMD3(0, 0, 0)))
  }

  func testDrawableExcludesRoomsAndParkedInstances() {
    var inRoom = placement(origin: .zero)
    inRoom.placement = "room"
    var parked = placement(origin: .zero)
    parked.withinWorld = false

    XCTAssertTrue(placement(origin: .zero).isDrawable)
    XCTAssertFalse(inRoom.isDrawable)
    XCTAssertFalse(parked.isDrawable)
  }
}
