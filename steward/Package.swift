// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "Steward",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(name: "StewardCore", targets: ["StewardCore"]),
        .executable(name: "Steward", targets: ["StewardApp"])
    ],
    targets: [
        .target(name: "StewardCore"),
        .executableTarget(
            name: "StewardApp",
            dependencies: ["StewardCore"]
        ),
        .testTarget(
            name: "StewardCoreTests",
            dependencies: ["StewardCore"]
        )
    ]
)
