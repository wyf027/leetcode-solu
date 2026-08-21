import Foundation

struct CommandStream {
  private let handle: FileHandle
  private let maxLineBytes: Int
  private let readSize: Int

  init(
    handle: FileHandle = .standardInput,
    maxLineBytes: Int = 4096,
    readSize: Int = 1024
  ) {
    self.handle = handle
    self.maxLineBytes = maxLineBytes
    self.readSize = readSize
  }

  func consume(_ body: (Data) throws -> Void) throws {
    var buffer = Data()

    while true {
      let chunk = try handle.read(upToCount: readSize) ?? Data()
      if chunk.isEmpty {
        if !buffer.isEmpty {
          try consumeLine(buffer, body: body)
        }
        return
      }

      buffer.append(chunk)
      while let newline = buffer.firstIndex(of: 0x0a) {
        let line = Data(buffer[..<newline])
        let next = buffer.index(after: newline)
        buffer.removeSubrange(buffer.startIndex..<next)
        try consumeLine(line, body: body)
      }

      if buffer.count > maxLineBytes {
        throw CommandStreamError.lineTooLong
      }
    }
  }

  private func consumeLine(
    _ input: Data,
    body: (Data) throws -> Void
  ) throws {
    var line = input
    if line.last == 0x0d { line.removeLast() }
    if line.isEmpty { return }
    if line.count > maxLineBytes { throw CommandStreamError.lineTooLong }
    try body(line)
  }
}

enum CommandStreamError: Error {
  case lineTooLong
}
