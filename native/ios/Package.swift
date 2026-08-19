// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WiforaReceiverKit",
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
        .tvOS(.v15)
    ],
    products: [
        .library(
            name: "WiforaReceiverKit",
            targets: ["WiforaReceiverKit"]
        ),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "WiforaReceiverKit",
            dependencies: [],
            path: "Sources/WiforaReceiverKit"
        ),
        .testTarget(
            name: "WiforaReceiverKitTests",
            dependencies: ["WiforaReceiverKit"],
            path: "Tests/WiforaReceiverKitTests"
        ),
    ]
)
