import AppKit
import Foundation

final class DisplayIdentifier {
  private let panels: [NSPanel]

  init(displays: [DisplayDescriptor]) {
    let screens: [CGDirectDisplayID: NSScreen] = Dictionary(
      uniqueKeysWithValues: NSScreen.screens.compactMap { screen in
        guard
          let number = screen.deviceDescription[
            NSDeviceDescriptionKey("NSScreenNumber")
          ] as? NSNumber
        else {
          return nil
        }
        return (CGDirectDisplayID(number.uint32Value), screen)
      }
    )
    panels = displays.compactMap { display in
      guard let screen = screens[display.displayID] else { return nil }
      return Self.makePanel(display: display, screen: screen)
    }
  }

  var isReady: Bool { !panels.isEmpty }

  func show(for duration: TimeInterval = 6) {
    NSApplication.shared.setActivationPolicy(.accessory)
    for panel in panels { panel.orderFrontRegardless() }
    RunLoop.main.run(until: Date().addingTimeInterval(duration))
    for panel in panels { panel.orderOut(nil) }
  }

  private static func makePanel(display: DisplayDescriptor, screen: NSScreen) -> NSPanel {
    let size = NSSize(width: 320, height: 180)
    let frame = NSRect(
      x: screen.frame.midX - (size.width / 2),
      y: screen.frame.midY - (size.height / 2),
      width: size.width,
      height: size.height
    )
    let panel = NSPanel(
      contentRect: frame,
      styleMask: [.borderless],
      backing: .buffered,
      defer: false,
      screen: screen
    )
    panel.backgroundColor = NSColor(calibratedWhite: 0.04, alpha: 0.94)
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    panel.hasShadow = true
    panel.ignoresMouseEvents = true
    panel.isOpaque = false
    panel.level = .screenSaver
    panel.contentView?.wantsLayer = true
    panel.contentView?.layer?.cornerRadius = 24
    panel.contentView?.layer?.masksToBounds = true

    let title = NSTextField(labelWithString: "屏幕 \(display.ordinal)")
    title.alignment = .center
    title.font = .systemFont(ofSize: 52, weight: .bold)
    title.textColor = NSColor(calibratedRed: 0.19, green: 0.82, blue: 0.77, alpha: 1)

    let detail = NSTextField(
      labelWithString: "\(display.name) · \(display.width) × \(display.height)"
    )
    detail.alignment = .center
    detail.font = .systemFont(ofSize: 15, weight: .medium)
    detail.textColor = NSColor(calibratedWhite: 0.82, alpha: 1)

    let stack = NSStackView(views: [title, detail])
    stack.alignment = .centerX
    stack.orientation = .vertical
    stack.spacing = 14
    stack.translatesAutoresizingMaskIntoConstraints = false
    panel.contentView?.addSubview(stack)
    if let contentView = panel.contentView {
      NSLayoutConstraint.activate([
        stack.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
        stack.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
        stack.leadingAnchor.constraint(
          greaterThanOrEqualTo: contentView.leadingAnchor,
          constant: 16
        ),
        stack.trailingAnchor.constraint(
          lessThanOrEqualTo: contentView.trailingAnchor,
          constant: -16
        ),
      ])
    }
    return panel
  }
}
