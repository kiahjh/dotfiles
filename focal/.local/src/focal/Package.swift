// swift-tools-version: 5.10

import PackageDescription

let package = Package(
  name: "Focal",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(name: "Focal", targets: ["FocalAgent"])
  ],
  targets: [
    .target(name: "FocalCore"),
    .executableTarget(
      name: "FocalAgent",
      dependencies: ["FocalCore"]
    ),
    .testTarget(
      name: "FocalCoreTests",
      dependencies: ["FocalCore"]
    ),
  ]
)
