// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "MacExperiencePrototype",
  platforms: [.macOS(.v26)],
  products: [
    .executable(name: "mac-experience-prototype", targets: ["MacExperiencePrototype"])
  ],
  targets: [
    .target(name: "MacExperienceCore"),
    .executableTarget(
      name: "MacExperiencePrototype",
      dependencies: ["MacExperienceCore"]
    ),
    .testTarget(
      name: "MacExperienceCoreTests",
      dependencies: ["MacExperienceCore"]
    ),
    .testTarget(
      name: "MacExperiencePrototypeTests",
      dependencies: ["MacExperiencePrototype", "MacExperienceCore"]
    ),
  ]
)
