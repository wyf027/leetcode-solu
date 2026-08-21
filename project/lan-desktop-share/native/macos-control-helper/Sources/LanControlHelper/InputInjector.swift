import ApplicationServices
import CoreGraphics
import Foundation

final class InputInjector {
  private static let keyCodes: [ControlKey: CGKeyCode] = [
    .arrowDown: 125,
    .arrowLeft: 123,
    .arrowRight: 124,
    .arrowUp: 126,
    .backspace: 51,
    .delete: 117,
    .end: 119,
    .enter: 36,
    .escape: 53,
    .home: 115,
    .pageDown: 121,
    .pageUp: 116,
    .tab: 48,
  ]

  private let bounds: CGRect
  private let lock = NSRecursiveLock()
  private var cursorPosition: CGPoint
  private var pressedButtons = Set<MouseButton>()
  private var pressedKeys = Set<ControlKey>()

  init(bounds: CGRect) {
    self.bounds = bounds
    cursorPosition =
      CGEvent(source: nil)?.location
      ?? CGPoint(x: bounds.midX, y: bounds.midY)
  }

  func apply(_ command: ControlCommand) throws {
    lock.lock()
    defer { lock.unlock() }
    switch command {
    case .mouseMove(let x, let y):
      try moveMouse(x: x, y: y)
    case .mouseButton(let button, let state):
      try setMouseButton(button, state: state)
    case .scroll(let deltaX, let deltaY):
      try scroll(deltaX: deltaX, deltaY: deltaY)
    case .key(let key, let state):
      try setKey(key, state: state)
    case .text(let text):
      try typeText(text)
    case .releaseAll:
      releaseAll()
    }
  }

  func releaseAll() {
    lock.lock()
    defer { lock.unlock() }
    for key in pressedKeys {
      postKey(key, isDown: false)
    }
    pressedKeys.removeAll()

    for button in pressedButtons {
      postMouseButton(button, isDown: false)
    }
    pressedButtons.removeAll()
  }

  private func moveMouse(x: Double, y: Double) throws {
    cursorPosition = CGPoint(
      x: bounds.minX + (bounds.width * x),
      y: bounds.minY + (bounds.height * y)
    )

    let eventType: CGEventType
    let eventButton: CGMouseButton
    if pressedButtons.contains(.left) {
      eventType = .leftMouseDragged
      eventButton = .left
    } else if pressedButtons.contains(.right) {
      eventType = .rightMouseDragged
      eventButton = .right
    } else {
      eventType = .mouseMoved
      eventButton = .left
    }

    guard
      let event = CGEvent(
        mouseEventSource: nil,
        mouseType: eventType,
        mouseCursorPosition: cursorPosition,
        mouseButton: eventButton
      )
    else {
      throw InputInjectorError.eventCreationFailed
    }
    event.post(tap: .cghidEventTap)
  }

  private func setMouseButton(_ button: MouseButton, state: PressState) throws {
    if state == .down {
      guard !pressedButtons.contains(button) else { return }
      guard postMouseButton(button, isDown: true) else {
        throw InputInjectorError.eventCreationFailed
      }
      pressedButtons.insert(button)
      return
    }

    guard pressedButtons.contains(button) else { return }
    guard postMouseButton(button, isDown: false) else {
      throw InputInjectorError.eventCreationFailed
    }
    pressedButtons.remove(button)
  }

  @discardableResult
  private func postMouseButton(_ button: MouseButton, isDown: Bool) -> Bool {
    let eventType: CGEventType =
      switch (button, isDown) {
      case (.left, true): .leftMouseDown
      case (.left, false): .leftMouseUp
      case (.right, true): .rightMouseDown
      case (.right, false): .rightMouseUp
      }
    let mouseButton: CGMouseButton = button == .left ? .left : .right
    guard
      let event = CGEvent(
        mouseEventSource: nil,
        mouseType: eventType,
        mouseCursorPosition: cursorPosition,
        mouseButton: mouseButton
      )
    else {
      return false
    }
    event.post(tap: .cghidEventTap)
    return true
  }

  private func scroll(deltaX: Double, deltaY: Double) throws {
    guard
      let event = CGEvent(
        scrollWheelEvent2Source: nil,
        units: .pixel,
        wheelCount: 2,
        wheel1: Int32((-deltaY).rounded()),
        wheel2: Int32((-deltaX).rounded()),
        wheel3: 0
      )
    else {
      throw InputInjectorError.eventCreationFailed
    }
    event.post(tap: .cghidEventTap)
  }

  private func setKey(_ key: ControlKey, state: PressState) throws {
    if state == .down {
      guard !pressedKeys.contains(key) else { return }
      guard postKey(key, isDown: true) else {
        throw InputInjectorError.eventCreationFailed
      }
      pressedKeys.insert(key)
      return
    }

    guard pressedKeys.contains(key) else { return }
    guard postKey(key, isDown: false) else {
      throw InputInjectorError.eventCreationFailed
    }
    pressedKeys.remove(key)
  }

  @discardableResult
  private func postKey(_ key: ControlKey, isDown: Bool) -> Bool {
    guard let keyCode = Self.keyCodes[key],
      let event = CGEvent(
        keyboardEventSource: nil,
        virtualKey: keyCode,
        keyDown: isDown
      )
    else {
      return false
    }
    event.post(tap: .cghidEventTap)
    return true
  }

  private func typeText(_ text: String) throws {
    let codeUnits = Array(text.utf16)
    guard
      let keyDown = CGEvent(
        keyboardEventSource: nil,
        virtualKey: 0,
        keyDown: true
      ),
      let keyUp = CGEvent(
        keyboardEventSource: nil,
        virtualKey: 0,
        keyDown: false
      )
    else {
      throw InputInjectorError.eventCreationFailed
    }

    codeUnits.withUnsafeBufferPointer { buffer in
      keyDown.keyboardSetUnicodeString(
        stringLength: buffer.count,
        unicodeString: buffer.baseAddress
      )
    }
    keyDown.post(tap: .cghidEventTap)
    keyUp.post(tap: .cghidEventTap)
  }
}

enum InputInjectorError: Error {
  case eventCreationFailed
}
