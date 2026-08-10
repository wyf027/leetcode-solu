import type { ProblemSummary } from '../domain/problem'
import type { LoadedSourceFile } from '../infrastructure/sourceFile'
import { createCodeBuffer } from './codeBuffer'
import type { CodeBuffer } from './codeBuffer'

export type EditorPhase = 'idle' | 'launching' | 'editing' | 'closing'
export type EditorCloseIntent = 'back' | 'quit'

export interface EditorSessionState {
  phase: EditorPhase
  problemId: number | null
  problemTitle: string | null
  document: LoadedSourceFile | null
  buffer: CodeBuffer | null
  pendingCloseIntent: EditorCloseIntent | null
}

export function createEditorSessionState(): EditorSessionState {
  return {
    phase: 'idle',
    problemId: null,
    problemTitle: null,
    document: null,
    buffer: null,
    pendingCloseIntent: null,
  }
}

export function beginEditorLaunch(state: EditorSessionState, problem: ProblemSummary): void {
  state.phase = 'launching'
  state.problemId = problem.id
  state.problemTitle = problem.localizedTitle ?? problem.title
  state.document = null
  state.buffer = null
  state.pendingCloseIntent = null
}

export function openEditorDocument(state: EditorSessionState, document: LoadedSourceFile): void {
  state.document = document
  state.buffer = createCodeBuffer(document.content)
  state.phase = 'editing'
}

export function requestEditorClose(
  state: EditorSessionState,
  intent: EditorCloseIntent,
): 'close' | 'confirm' | 'ignored' {
  if (state.phase !== 'editing' || state.buffer === null) return 'ignored'
  if (state.buffer.dirty) {
    state.pendingCloseIntent = intent
    return 'confirm'
  }
  state.pendingCloseIntent = intent
  state.phase = 'closing'
  return 'close'
}

export function cancelEditorClose(state: EditorSessionState): void {
  state.pendingCloseIntent = null
}

export function confirmEditorDiscard(state: EditorSessionState): EditorCloseIntent | null {
  const intent = state.pendingCloseIntent
  if (intent === null || state.phase !== 'editing') return null
  state.phase = 'closing'
  return intent
}

export function finishEditorSession(state: EditorSessionState): void {
  state.phase = 'idle'
  state.problemId = null
  state.problemTitle = null
  state.document = null
  state.buffer = null
  state.pendingCloseIntent = null
}
