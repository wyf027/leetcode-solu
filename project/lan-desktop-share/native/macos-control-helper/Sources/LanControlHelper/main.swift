import Darwin
import Foundation

struct HelperStatus: Encodable {
  let v = 1
  let status: String
  let accessibility: Bool?
  let configurationSignature: String?
  let displays: [DisplayDescriptor]?
  let reason: String?

  init(
    status: String,
    accessibility: Bool? = nil,
    configurationSignature: String? = nil,
    displays: [DisplayDescriptor]? = nil,
    reason: String? = nil
  ) {
    self.status = status
    self.accessibility = accessibility
    self.configurationSignature = configurationSignature
    self.displays = displays
    self.reason = reason
  }
}

func emit(_ value: HelperStatus) {
  guard var data = try? JSONEncoder().encode(value) else { return }
  data.append(0x0a)
  FileHandle.standardOutput.write(data)
}

func unavailableStatus(_ environment: DisplayEnvironment) -> HelperStatus {
  HelperStatus(
    status: "unavailable",
    accessibility: environment.accessibility,
    configurationSignature: environment.configurationSignature,
    displays: environment.displays,
    reason: environment.reason
  )
}

func run() -> Int32 {
  let arguments = Array(CommandLine.arguments.dropFirst())
  let environment = DisplayEnvironment.current()

  if arguments == ["--probe"] {
    emit(
      environment.isAvailable
        ? HelperStatus(
          status: "available",
          accessibility: environment.accessibility,
          configurationSignature: environment.configurationSignature,
          displays: environment.displays
        )
        : unavailableStatus(environment)
    )
    return 0
  }

  if arguments == ["--identify"] {
    guard environment.isAvailable else {
      emit(unavailableStatus(environment))
      return 2
    }
    let identifier = DisplayIdentifier(displays: environment.displays)
    guard identifier.isReady else {
      emit(HelperStatus(status: "unavailable", reason: "display-unavailable"))
      return 2
    }
    emit(
      HelperStatus(
        status: "identified",
        accessibility: environment.accessibility,
        configurationSignature: environment.configurationSignature,
        displays: environment.displays
      )
    )
    identifier.show()
    return 0
  }

  guard
    arguments.count == 4,
    arguments[0] == "--display",
    arguments[2] == "--configuration"
  else {
    emit(HelperStatus(status: "error", reason: "invalid-arguments"))
    return 64
  }
  guard environment.isAvailable else {
    emit(unavailableStatus(environment))
    return 2
  }
  guard environment.configurationSignature == arguments[3] else {
    emit(HelperStatus(status: "unavailable", reason: "display-configuration-changed"))
    return 3
  }
  guard let selection = environment.selection(for: arguments[1]) else {
    emit(HelperStatus(status: "unavailable", reason: "display-selection-invalid"))
    return 2
  }

  let injector = InputInjector(bounds: selection.bounds)
  let monitor = DisplayConfigurationMonitor(selection: selection) {
    injector.releaseAll()
    emit(HelperStatus(status: "error", reason: "display-configuration-changed"))
    Darwin.exit(3)
  }
  monitor.start()
  defer {
    monitor.stop()
    injector.releaseAll()
  }
  emit(HelperStatus(status: "ready"))

  do {
    try CommandStream().consume { data in
      guard selection.isCurrent() else {
        throw DisplayEnvironmentError.configurationChanged
      }
      let command = try ControlCommand.decode(data)
      try injector.apply(command)
    }
    return 0
  } catch DisplayEnvironmentError.configurationChanged {
    emit(HelperStatus(status: "error", reason: "display-configuration-changed"))
    return 3
  } catch {
    emit(HelperStatus(status: "error", reason: "invalid-command"))
    return 1
  }
}

exit(run())
