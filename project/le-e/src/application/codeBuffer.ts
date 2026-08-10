import stringWidth from 'string-width'

export interface CodeBuffer {
  lines: string[]
  cursorRow: number
  cursorColumn: number
  preferredColumn: number | null
  scrollRow: number
  scrollColumn: number
  dirty: boolean
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function boundaries(text: string): number[] {
  const result = [...graphemeSegmenter.segment(text)].map(({ index }) => index)
  result.push(text.length)
  return result
}

function previousBoundary(text: string, column: number): number {
  const candidates = boundaries(text).filter((boundary) => boundary < column)
  return candidates.at(-1) ?? 0
}

function nextBoundary(text: string, column: number): number {
  return boundaries(text).find((boundary) => boundary > column) ?? text.length
}

function columnAtCell(text: string, targetCell: number): number {
  let bestColumn = 0
  let bestDistance = Math.abs(targetCell)
  for (const column of boundaries(text)) {
    const distance = Math.abs(stringWidth(text.slice(0, column)) - targetCell)
    if (distance > bestDistance) break
    bestColumn = column
    bestDistance = distance
  }
  return bestColumn
}

function markChanged(buffer: CodeBuffer): void {
  buffer.dirty = true
  buffer.preferredColumn = null
}

function clampCursor(buffer: CodeBuffer): void {
  buffer.cursorRow = Math.min(buffer.lines.length - 1, Math.max(0, buffer.cursorRow))
  const line = buffer.lines[buffer.cursorRow] ?? ''
  buffer.cursorColumn = Math.min(line.length, Math.max(0, buffer.cursorColumn))
}

export function createCodeBuffer(content: string): CodeBuffer {
  const normalized = content.replace(/\r\n?/g, '\n')
  return {
    lines: normalized.split('\n'),
    cursorRow: 0,
    cursorColumn: 0,
    preferredColumn: null,
    scrollRow: 0,
    scrollColumn: 0,
    dirty: false,
  }
}

export function codeBufferText(buffer: CodeBuffer): string {
  return buffer.lines.join('\n')
}

export function markCodeBufferSaved(buffer: CodeBuffer): void {
  buffer.dirty = false
}

export function insertCodeText(buffer: CodeBuffer, input: string): void {
  if (input === '') return
  const text = input.replace(/\r\n?/g, '\n')
  const line = buffer.lines[buffer.cursorRow] ?? ''
  const before = line.slice(0, buffer.cursorColumn)
  const after = line.slice(buffer.cursorColumn)
  const inserted = text.split('\n')

  if (inserted.length === 1) {
    const value = inserted[0] ?? ''
    buffer.lines[buffer.cursorRow] = `${before}${value}${after}`
    buffer.cursorColumn += value.length
  } else {
    const first = inserted[0] ?? ''
    const last = inserted.at(-1) ?? ''
    const replacement = [`${before}${first}`, ...inserted.slice(1, -1), `${last}${after}`]
    buffer.lines.splice(buffer.cursorRow, 1, ...replacement)
    buffer.cursorRow += replacement.length - 1
    buffer.cursorColumn = last.length
  }
  markChanged(buffer)
}

export function insertCodeNewline(buffer: CodeBuffer): void {
  insertCodeText(buffer, '\n')
}

export function backspaceCode(buffer: CodeBuffer): void {
  const line = buffer.lines[buffer.cursorRow] ?? ''
  if (buffer.cursorColumn > 0) {
    const start = previousBoundary(line, buffer.cursorColumn)
    buffer.lines[buffer.cursorRow] = `${line.slice(0, start)}${line.slice(buffer.cursorColumn)}`
    buffer.cursorColumn = start
    markChanged(buffer)
    return
  }
  if (buffer.cursorRow === 0) return

  const previous = buffer.lines[buffer.cursorRow - 1] ?? ''
  buffer.lines[buffer.cursorRow - 1] = `${previous}${line}`
  buffer.lines.splice(buffer.cursorRow, 1)
  buffer.cursorRow -= 1
  buffer.cursorColumn = previous.length
  markChanged(buffer)
}

export function deleteCodeForward(buffer: CodeBuffer): void {
  const line = buffer.lines[buffer.cursorRow] ?? ''
  if (buffer.cursorColumn < line.length) {
    const end = nextBoundary(line, buffer.cursorColumn)
    buffer.lines[buffer.cursorRow] = `${line.slice(0, buffer.cursorColumn)}${line.slice(end)}`
    markChanged(buffer)
    return
  }
  if (buffer.cursorRow >= buffer.lines.length - 1) return

  buffer.lines[buffer.cursorRow] = `${line}${buffer.lines[buffer.cursorRow + 1] ?? ''}`
  buffer.lines.splice(buffer.cursorRow + 1, 1)
  markChanged(buffer)
}

export function moveCodeLeft(buffer: CodeBuffer): void {
  const line = buffer.lines[buffer.cursorRow] ?? ''
  if (buffer.cursorColumn > 0) {
    buffer.cursorColumn = previousBoundary(line, buffer.cursorColumn)
  } else if (buffer.cursorRow > 0) {
    buffer.cursorRow -= 1
    buffer.cursorColumn = (buffer.lines[buffer.cursorRow] ?? '').length
  }
  buffer.preferredColumn = null
}

export function moveCodeRight(buffer: CodeBuffer): void {
  const line = buffer.lines[buffer.cursorRow] ?? ''
  if (buffer.cursorColumn < line.length) {
    buffer.cursorColumn = nextBoundary(line, buffer.cursorColumn)
  } else if (buffer.cursorRow < buffer.lines.length - 1) {
    buffer.cursorRow += 1
    buffer.cursorColumn = 0
  }
  buffer.preferredColumn = null
}

export function moveCodeVertical(buffer: CodeBuffer, delta: number): void {
  const current = buffer.lines[buffer.cursorRow] ?? ''
  const desired = buffer.preferredColumn ?? stringWidth(current.slice(0, buffer.cursorColumn))
  buffer.preferredColumn = desired
  buffer.cursorRow = Math.min(buffer.lines.length - 1, Math.max(0, buffer.cursorRow + delta))
  buffer.cursorColumn = columnAtCell(buffer.lines[buffer.cursorRow] ?? '', desired)
  clampCursor(buffer)
}

export function moveCodeHome(buffer: CodeBuffer): void {
  buffer.cursorColumn = 0
  buffer.preferredColumn = null
}

export function moveCodeEnd(buffer: CodeBuffer): void {
  buffer.cursorColumn = (buffer.lines[buffer.cursorRow] ?? '').length
  buffer.preferredColumn = null
}

export function moveCodePage(buffer: CodeBuffer, deltaPages: number, viewportRows: number): void {
  moveCodeVertical(buffer, deltaPages * Math.max(1, viewportRows))
}

export function ensureCodeCursorVisible(
  buffer: CodeBuffer,
  viewportRows: number,
  viewportColumns: number,
): void {
  const rows = Math.max(1, viewportRows)
  const columns = Math.max(1, viewportColumns)
  if (buffer.cursorRow < buffer.scrollRow) buffer.scrollRow = buffer.cursorRow
  else if (buffer.cursorRow >= buffer.scrollRow + rows) {
    buffer.scrollRow = buffer.cursorRow - rows + 1
  }

  const line = buffer.lines[buffer.cursorRow] ?? ''
  const cursorCell = stringWidth(line.slice(0, buffer.cursorColumn))
  if (cursorCell < buffer.scrollColumn) buffer.scrollColumn = cursorCell
  else if (cursorCell >= buffer.scrollColumn + columns) {
    buffer.scrollColumn = cursorCell - columns + 1
  }
}

export function sliceCodeLineByCells(line: string, startCell: number, width: number): string {
  let result = ''
  let cell = 0
  const endCell = startCell + Math.max(0, width)
  for (const segment of graphemeSegmenter.segment(line)) {
    const segmentWidth = stringWidth(segment.segment)
    const nextCell = cell + segmentWidth
    if (nextCell > startCell && cell < endCell && nextCell <= endCell) {
      result += segment.segment
    }
    if (cell >= endCell) break
    cell = nextCell
  }
  return result
}

export function codeCursorCell(buffer: CodeBuffer): number {
  const line = buffer.lines[buffer.cursorRow] ?? ''
  return stringWidth(line.slice(0, buffer.cursorColumn))
}
