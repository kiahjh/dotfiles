// swift-tools-version: 5.10

import PackageDescription

let package = Package(
  name: "CapsLock",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(name: "CapsLock", targets: ["CapsLockAgent"])
  ],
  targets: [
    .target(name: "CapsLockCore"),
    .executableTarget(
      name: "CapsLockAgent",
      dependencies: ["CapsLockCore"]
    ),
    .testTarget(
      name: "CapsLockCoreTests",
      dependencies: ["CapsLockCore"]
    ),
  ]
)
