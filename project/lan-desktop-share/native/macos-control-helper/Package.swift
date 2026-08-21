// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "LanControlHelper",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "lan-control-helper", targets: ["LanControlHelper"])
  ],
  targets: [
    .executableTarget(name: "LanControlHelper")
  ]
)
