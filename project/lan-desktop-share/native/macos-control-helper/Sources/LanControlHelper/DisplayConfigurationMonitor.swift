import Foundation

final class DisplayConfigurationMonitor {
  private let selection: DisplaySelection
  private let onChange: () -> Void
  private let queue = DispatchQueue(label: "lan-control-display-monitor")
  private let stateLock = NSLock()
  private var fired = false
  private var timer: DispatchSourceTimer?

  init(selection: DisplaySelection, onChange: @escaping () -> Void) {
    self.selection = selection
    self.onChange = onChange
  }

  func start() {
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now() + .milliseconds(500), repeating: .milliseconds(500))
    timer.setEventHandler { [weak self] in
      guard let self, !self.selection.isCurrent() else { return }
      self.stateLock.lock()
      let shouldFire = !self.fired
      self.fired = true
      self.stateLock.unlock()
      if shouldFire { self.onChange() }
    }
    self.timer = timer
    timer.resume()
  }

  func stop() {
    timer?.cancel()
    timer = nil
  }
}
