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
    // Host tooling, deliberately outside the kit: reading a command line is not
    // part of the surface a browser implementation has to reproduce.
    .target(name: "MercenaryCLI"),
    .executableTarget(name: "Mercenary", dependencies: ["MercenaryKit", "MercenaryCLI"]),
    .testTarget(name: "MercenaryKitTests", dependencies: ["MercenaryKit"]),
    .testTarget(name: "MercenaryCLITests", dependencies: ["MercenaryCLI"]),
  ]
)
