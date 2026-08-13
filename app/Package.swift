// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "Mercenary",
  platforms: [.macOS(.v26)],
  products: [
    .executable(name: "mercenary", targets: ["Mercenary"]),
    .library(name: "MercenaryKit", targets: ["MercenaryKit"]),
  ],
  targets: [
    .target(name: "MercenaryKit"),
    .executableTarget(name: "Mercenary", dependencies: ["MercenaryKit"]),
    .testTarget(name: "MercenaryKitTests", dependencies: ["MercenaryKit"]),
  ]
)
