import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

struct DisplayDescriptor: Encodable {
  let id: String
  let ordinal: Int
  let name: String
  let width: Int
  let height: Int
  let isMain: Bool
  let displayID: CGDirectDisplayID
  let bounds: CGRect

  enum CodingKeys: String, CodingKey {
    case id
    case ordinal
    case name
    case width
    case height
    case isMain
  }
}

struct DisplaySelection {
  let displayID: CGDirectDisplayID
  let bounds: CGRect
  let configurationSignature: String

  func isCurrent() -> Bool {
    let environment = DisplayEnvironment.current()
    guard
      environment.displayLookupSucceeded,
      environment.configurationSignature == configurationSignature,
      let current = environment.displays.first(where: { $0.displayID == displayID })
    else {
      return false
    }
    return current.bounds == bounds
  }
}

enum DisplayEnvironmentError: Error {
  case configurationChanged
}

struct DisplayEnvironment {
  let accessibility: Bool
  let displays: [DisplayDescriptor]
  let displayLookupSucceeded: Bool
  let configurationSignature: String

  var isAvailable: Bool {
    accessibility && displayLookupSucceeded && !displays.isEmpty
  }

  var reason: String? {
    if !accessibility { return "accessibility-denied" }
    if !displayLookupSucceeded || displays.isEmpty { return "display-unavailable" }
    return nil
  }

  func selection(for rawDisplayID: String) -> DisplaySelection? {
    guard
      let displayID = UInt32(rawDisplayID),
      let display = displays.first(where: { $0.displayID == displayID })
    else {
      return nil
    }
    return DisplaySelection(
      displayID: display.displayID,
      bounds: display.bounds,
      configurationSignature: configurationSignature
    )
  }

  static func current() -> DisplayEnvironment {
    let accessibility = AXIsProcessTrusted()
    var count: UInt32 = 0
    let countResult = CGGetActiveDisplayList(0, nil, &count)
    guard countResult == .success, count > 0 else {
      return DisplayEnvironment(
        accessibility: accessibility,
        displays: [],
        displayLookupSucceeded: false,
        configurationSignature: ""
      )
    }

    var displayIDs = Array(repeating: CGDirectDisplayID(), count: Int(count))
    var populated: UInt32 = 0
    let displayResult = CGGetActiveDisplayList(count, &displayIDs, &populated)
    guard displayResult == .success, populated > 0 else {
      return DisplayEnvironment(
        accessibility: accessibility,
        displays: [],
        displayLookupSucceeded: false,
        configurationSignature: ""
      )
    }

    let activeDisplayIDs = displayIDs.prefix(Int(populated))
    let sortedDisplays = activeDisplayIDs.compactMap { displayID -> (CGDirectDisplayID, CGRect)? in
      let bounds = CGDisplayBounds(displayID)
      guard bounds.width > 0, bounds.height > 0 else { return nil }
      return (displayID, bounds)
    }.sorted { left, right in
      if left.1.minX != right.1.minX { return left.1.minX < right.1.minX }
      return left.1.minY < right.1.minY
    }

    let names: [CGDirectDisplayID: String] = Dictionary(
      uniqueKeysWithValues: NSScreen.screens.compactMap { screen in
        guard
          let number = screen.deviceDescription[
            NSDeviceDescriptionKey("NSScreenNumber")
          ] as? NSNumber
        else {
          return nil
        }
        return (CGDirectDisplayID(number.uint32Value), screen.localizedName)
      }
    )
    let displays = sortedDisplays.enumerated().map { index, value in
      let (displayID, bounds) = value
      return DisplayDescriptor(
        id: String(displayID),
        ordinal: index + 1,
        name: names[displayID] ?? "显示器",
        width: Int(bounds.width.rounded()),
        height: Int(bounds.height.rounded()),
        isMain: CGDisplayIsMain(displayID) != 0,
        displayID: displayID,
        bounds: bounds
      )
    }
    let signatureParts: [String] = displays.map { display in
      let bounds = display.bounds
      let rotation = CGDisplayRotation(display.displayID)
      let mirroredDisplay = CGDisplayMirrorsDisplay(display.displayID)
      let minX = String(Double(bounds.minX))
      let minY = String(Double(bounds.minY))
      let width = String(Double(bounds.width))
      let height = String(Double(bounds.height))
      let rotationValue = String(rotation)
      let mirrorValue = String(mirroredDisplay)
      let values: [String] = [
        display.id, minX, minY, width, height, rotationValue, mirrorValue,
      ]
      return values.joined(separator: ":")
    }
    let signature = signatureParts.joined(separator: "|")

    return DisplayEnvironment(
      accessibility: accessibility,
      displays: displays,
      displayLookupSucceeded: displays.count == Int(populated),
      configurationSignature: signature
    )
  }
}
