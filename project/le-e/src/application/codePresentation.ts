import stringWidth from 'string-width'

import { sliceCodeLineByCells } from './codeBuffer'

export type JavaScriptTokenKind =
  'builtin' | 'comment' | 'function' | 'indent' | 'keyword' | 'number' | 'operator' | 'string'

export interface JavaScriptToken {
  readonly start: number
  readonly end: number
  readonly kind: JavaScriptTokenKind
}

export interface VisibleCodeSegment {
  readonly x: number
  readonly text: string
  readonly width: number
  readonly kind: JavaScriptTokenKind
}

type LexerMode = 'normal' | 'block-comment' | 'template'

interface HighlightLineResult {
  readonly tokens: readonly JavaScriptToken[]
  readonly mode: LexerMode
}

const KEYWORDS = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'null',
  'of',
  'return',
  'set',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

const BUILTINS = new Set([
  'Array',
  'BigInt',
  'Boolean',
  'Date',
  'Error',
  'Infinity',
  'JSON',
  'Map',
  'Math',
  'NaN',
  'Number',
  'Object',
  'Promise',
  'RegExp',
  'Set',
  'String',
  'Symbol',
  'WeakMap',
  'WeakSet',
  'console',
])

const NUMBER_PATTERN =
  /^(?:0[xX][\dA-Fa-f]+|0[bB][01]+|0[oO][0-7]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?n?)/
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*/
const OPERATOR_PATTERN =
  /^(?:=>|===|!==|>>>|<<|>>|\*\*|\?\?|\?\.|&&|\|\||==|!=|<=|>=|\+\+|--|\+=|-=|\*=|\/=|%=|[+\-*/%=&|!<>?:~^])/u
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export function editorGutterColumns(lineCount: number): number {
  return Math.max(3, String(Math.max(1, lineCount)).length) + 3
}

function quotedEnd(line: string, start: number, quote: "'" | '"' | '`'): number | null {
  for (let index = start + 1; index < line.length; index += 1) {
    const character = line[index]
    if (character === '\\') {
      index += 1
      continue
    }
    if (character === quote) return index + 1
  }
  return null
}

function highlightLine(line: string, initialMode: LexerMode): HighlightLineResult {
  const tokens: JavaScriptToken[] = []
  let mode = initialMode
  let index = 0

  while (index < line.length) {
    if (mode === 'block-comment') {
      const end = line.indexOf('*/', index)
      const tokenEnd = end < 0 ? line.length : end + 2
      tokens.push({ start: index, end: tokenEnd, kind: 'comment' })
      index = tokenEnd
      if (end < 0) break
      mode = 'normal'
      continue
    }

    if (mode === 'template') {
      const end = quotedEnd(line, Math.max(-1, index - 1), '`')
      const tokenEnd = end ?? line.length
      tokens.push({ start: index, end: tokenEnd, kind: 'string' })
      index = tokenEnd
      if (end === null) break
      mode = 'normal'
      continue
    }

    const rest = line.slice(index)
    if (rest.startsWith('//')) {
      tokens.push({ start: index, end: line.length, kind: 'comment' })
      break
    }
    if (rest.startsWith('/*')) {
      const end = line.indexOf('*/', index + 2)
      const tokenEnd = end < 0 ? line.length : end + 2
      tokens.push({ start: index, end: tokenEnd, kind: 'comment' })
      index = tokenEnd
      if (end < 0) {
        mode = 'block-comment'
        break
      }
      continue
    }

    const character = line[index]
    if (character === "'" || character === '"' || character === '`') {
      const end = quotedEnd(line, index, character)
      const tokenEnd = end ?? line.length
      tokens.push({ start: index, end: tokenEnd, kind: 'string' })
      index = tokenEnd
      if (character === '`' && end === null) mode = 'template'
      continue
    }

    const number = NUMBER_PATTERN.exec(rest)?.[0]
    if (number !== undefined) {
      tokens.push({ start: index, end: index + number.length, kind: 'number' })
      index += number.length
      continue
    }

    const identifier = IDENTIFIER_PATTERN.exec(rest)?.[0]
    if (identifier !== undefined) {
      const end = index + identifier.length
      const next = line.slice(end).trimStart()[0]
      const kind = KEYWORDS.has(identifier)
        ? 'keyword'
        : BUILTINS.has(identifier)
          ? 'builtin'
          : next === '('
            ? 'function'
            : null
      if (kind !== null) tokens.push({ start: index, end, kind })
      index = end
      continue
    }

    const operator = OPERATOR_PATTERN.exec(rest)?.[0]
    if (operator !== undefined) {
      tokens.push({ start: index, end: index + operator.length, kind: 'operator' })
      index += operator.length
      continue
    }

    index += 1
  }

  return { tokens, mode }
}

export function highlightJavaScriptLines(
  lines: readonly string[],
): readonly (readonly JavaScriptToken[])[] {
  const result: JavaScriptToken[][] = []
  let mode: LexerMode = 'normal'
  for (const line of lines) {
    const highlighted = highlightLine(line, mode)
    result.push([...highlighted.tokens])
    mode = highlighted.mode
  }
  return result
}

export function visibleIndentGuideSegments(
  line: string,
  scrollColumn: number,
  width: number,
): readonly VisibleCodeSegment[] {
  let leadingSpaces = 0
  while (line[leadingSpaces] === ' ') leadingSpaces += 1
  const visibleEnd = scrollColumn + Math.max(0, width)
  const segments: VisibleCodeSegment[] = []
  for (let index = 0; index < leadingSpaces; index += 2) {
    if (index < scrollColumn || index >= visibleEnd) continue
    segments.push({ x: index - scrollColumn, text: '│', width: 1, kind: 'indent' })
  }
  return segments
}

export function visibleHighlightSegments(
  line: string,
  tokens: readonly JavaScriptToken[],
  scrollColumn: number,
  width: number,
): readonly VisibleCodeSegment[] {
  const visibleStart = Math.max(0, scrollColumn)
  const visibleEnd = visibleStart + Math.max(0, width)
  const segments: VisibleCodeSegment[] = []

  for (const token of tokens) {
    const tokenText = line.slice(token.start, token.end)
    const tokenStart = stringWidth(line.slice(0, token.start))
    const tokenEnd = tokenStart + stringWidth(tokenText)
    const clippedStart = Math.max(tokenStart, visibleStart)
    const clippedEnd = Math.min(tokenEnd, visibleEnd)
    if (clippedStart >= clippedEnd) continue

    const text = sliceCodeLineByCells(
      tokenText,
      clippedStart - tokenStart,
      clippedEnd - clippedStart,
    )
    const segmentWidth = stringWidth(text)
    if (segmentWidth === 0) continue
    segments.push({
      x: clippedStart - visibleStart,
      text,
      width: segmentWidth,
      kind: token.kind,
    })
  }
  return segments
}

export function cursorCharacter(line: string, column: number): { text: string; width: number } {
  const suffix = line.slice(column)
  const first = graphemeSegmenter.segment(suffix)[Symbol.iterator]().next().value?.segment ?? ' '
  return { text: first, width: Math.max(1, stringWidth(first)) }
}
