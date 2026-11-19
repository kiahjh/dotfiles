// swift-tools-version: 5.10

import PackageDescription

let package = Package(
  name: "Solo",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(name: "Solo", targets: ["SoloAgent"])
  ],
  targets: [
    .target(name: "SoloCore"),
    .executableTarget(
      name: "SoloAgent",
      dependencies: ["SoloCore"]
    ),
    .testTarget(
      name: "SoloCoreTests",
      dependencies: ["SoloCore"]
    ),
  ]
)
