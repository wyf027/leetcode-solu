import CoreFoundation
import Foundation

enum MouseButton: String, Hashable {
  case left
  case right
}

enum PressState: String {
  case down
  case up
}

enum ControlKey: String, CaseIterable, Hashable {
  case arrowDown = "ArrowDown"
  case arrowLeft = "ArrowLeft"
  case arrowRight = "ArrowRight"
  case arrowUp = "ArrowUp"
  case backspace = "Backspace"
  case delete = "Delete"
  case end = "End"
  case enter = "Enter"
  case escape = "Escape"
  case home = "Home"
  case pageDown = "PageDown"
  case pageUp = "PageUp"
  case tab = "Tab"
}

enum ControlCommand {
  case key(key: ControlKey, state: PressState)
  case mouseButton(button: MouseButton, state: PressState)
  case mouseMove(x: Double, y: Double)
  case releaseAll
  case scroll(deltaX: Double, deltaY: Double)
  case text(String)

  static func decode(_ data: Data) throws -> ControlCommand {
    let value = try JSONSerialization.jsonObject(with: data)
    guard let dictionary = value as? [String: Any] else {
      throw ControlCommandError.invalidEnvelope
    }
    guard integer(dictionary["v"]) == 1,
      let type = dictionary["type"] as? String
    else {
      throw ControlCommandError.invalidEnvelope
    }

    switch type {
    case "mouseMove":
      try requireKeys(dictionary, expected: ["v", "type", "x", "y"])
      let x = try normalizedNumber(dictionary["x"])
      let y = try normalizedNumber(dictionary["y"])
      return .mouseMove(x: x, y: y)
    case "mouseButton":
      try requireKeys(dictionary, expected: ["v", "type", "button", "state"])
      guard let buttonValue = dictionary["button"] as? String,
        let button = MouseButton(rawValue: buttonValue),
        let stateValue = dictionary["state"] as? String,
        let state = PressState(rawValue: stateValue)
      else {
        throw ControlCommandError.invalidValue
      }
      return .mouseButton(button: button, state: state)
    case "scroll":
      try requireKeys(dictionary, expected: ["v", "type", "deltaX", "deltaY"])
      let deltaX = try boundedNumber(dictionary["deltaX"], absoluteLimit: 120)
      let deltaY = try boundedNumber(dictionary["deltaY"], absoluteLimit: 120)
      return .scroll(deltaX: deltaX, deltaY: deltaY)
    case "key":
      try requireKeys(dictionary, expected: ["v", "type", "key", "state"])
      guard let keyValue = dictionary["key"] as? String,
        let key = ControlKey(rawValue: keyValue),
        let stateValue = dictionary["state"] as? String,
        let state = PressState(rawValue: stateValue)
      else {
        throw ControlCommandError.invalidValue
      }
      return .key(key: key, state: state)
    case "text":
      try requireKeys(dictionary, expected: ["v", "type", "text"])
      guard let text = dictionary["text"] as? String,
        !text.isEmpty,
        text.unicodeScalars.count <= 32,
        !text.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7f })
      else {
        throw ControlCommandError.invalidValue
      }
      return .text(text)
    case "releaseAll":
      try requireKeys(dictionary, expected: ["v", "type"])
      return .releaseAll
    default:
      throw ControlCommandError.unsupportedType
    }
  }

  private static func requireKeys(
    _ dictionary: [String: Any],
    expected: Set<String>
  ) throws {
    guard Set(dictionary.keys) == expected else {
      throw ControlCommandError.invalidEnvelope
    }
  }

  private static func integer(_ value: Any?) -> Int? {
    guard let number = value as? NSNumber,
      CFGetTypeID(number) != CFBooleanGetTypeID(),
      number.doubleValue.rounded() == number.doubleValue
    else {
      return nil
    }
    return number.intValue
  }

  private static func normalizedNumber(_ value: Any?) throws -> Double {
    let number = try boundedNumber(value, absoluteLimit: 1)
    guard number >= 0 else { throw ControlCommandError.invalidValue }
    return number
  }

  private static func boundedNumber(
    _ value: Any?,
    absoluteLimit: Double
  ) throws -> Double {
    guard let number = value as? NSNumber,
      CFGetTypeID(number) != CFBooleanGetTypeID(),
      number.doubleValue.isFinite,
      abs(number.doubleValue) <= absoluteLimit
    else {
      throw ControlCommandError.invalidValue
    }
    return number.doubleValue
  }
}

enum ControlCommandError: Error {
  case invalidEnvelope
  case invalidValue
  case unsupportedType
}
