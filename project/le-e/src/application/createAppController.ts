import { reactive } from 'vue'

import { ERROR_CODES } from '../domain/errors'
import type { AppError } from '../domain/errors'
import type { FavoriteFolder } from '../domain/favorite'
import type { OperationKind, ParsedTestResult } from '../domain/operation'
import type {
  Difficulty,
  ProblemDetail,
  ProblemSummary,
  SubmissionStatus,
  TestStatus,
} from '../domain/problem'
import type {
  GatewayCallOptions,
  GatewayLogChunk,
  LeetCodeGateway,
} from '../infrastructure/leetcodeGateway'
import type { AccountFavoritesGateway } from '../infrastructure/accountFavoritesGateway'
import { EditorBridgeProtocolError } from '../infrastructure/editorBridgeProtocol'
import type { SourceBridgeSession } from '../infrastructure/sourceBridgeServer'
import { SourceFileError } from '../infrastructure/sourceFile'
import type { ValidatedSourceFile } from '../infrastructure/sourceFile'
import { filterProblems, selectVisibleProblemId } from './filters'
import type { ProblemFilters } from './filters'
import { appendLogEntries } from './logBuffer'
import type { LogEntry, LogLevel } from './logBuffer'
import { resolveProblemIdentity } from './problemIdentity'
import {
  closeSubmitDialog,
  handleSubmitDialogKey as transitionSubmitDialog,
  openSubmitDialog as createOpenSubmitDialog,
} from './submitState'
import type { SubmitDialogState } from './submitState'

export interface AppControllerState {
  phase: 'idle' | 'starting' | 'ready' | 'error'
  cliVersion: string | null
  cliVersionSupported: boolean
  problems: ProblemSummary[]
  collisionCandidates: Map<number, readonly ProblemSummary[]>
  filters: ProblemFilters
  selectedProblemId: number | null
  details: Map<number, ProblemDetail>
  activeOperation: OperationKind | null
  logs: LogEntry[]
  stale: boolean
  lastError: AppError | null
  sourceReadyIds: Set<number>
  testStatuses: Map<number, TestStatus>
  testResults: Map<number, ParsedTestResult>
  submissionStatuses: Map<number, SubmissionStatus>
  submitDialog: SubmitDialogState
  logExpanded: boolean
  viewMode: 'all' | 'favorites'
  favoritePage: 'folders' | 'questions'
  favoriteFolders: FavoriteFolder[]
  selectedFavoriteFolderSlug: string | null
}

export interface AppController {
  readonly state: AppControllerState
  start(): Promise<boolean>
  refresh(): Promise<boolean>
  visibleProblems(): ProblemSummary[]
  setQuery(query: string): void
  setDifficulty(difficulty: Difficulty | 'all'): void
  toggleStarredOnly(): void
  toggleView(): void
  moveFavoriteFolder(delta: number): void
  openFavoriteFolder(slug?: string): boolean
  closeFavoriteFolder(): boolean
  toggleFavoriteSelected(): Promise<boolean>
  selectProblem(id: number): void
  moveSelection(delta: number): void
  loadSelectedDetail(): Promise<boolean>
  editSelected(): Promise<boolean>
  dispose(): void
  testSelected(): Promise<boolean>
  openSubmitDialog(): boolean
  handleSubmitDialogKey(key: string): Promise<boolean>
  toggleLog(): void
}

export interface CreateAppControllerOptions {
  readonly gateway: LeetCodeGateway
  readonly now?: () => number
  readonly suspendForEditor?: () => void | Promise<void>
  readonly resumeAfterEditor?: () => void | Promise<void>
  readonly editorBridge?: EditorBridgeDependencies
  readonly vimEditor?: VimEditorDependencies
  readonly favoritesGateway?: AccountFavoritesGateway
}

export interface EditorBridgeDependencies {
  createBridge(options: { readonly signal: AbortSignal }): Promise<SourceBridgeSession>
  loadSource(path: string): Promise<ValidatedSourceFile>
}

export interface VimEditorDependencies {
  open(path: string, options: { readonly signal: AbortSignal }): Promise<void>
}

export function createAppController({
  gateway,
  now = Date.now,
  suspendForEditor = () => {},
  resumeAfterEditor = () => {},
  editorBridge,
  vimEditor,
  favoritesGateway,
}: CreateAppControllerOptions): AppController {
  const state: AppControllerState = reactive({
    phase: 'idle',
    cliVersion: null,
    cliVersionSupported: true,
    problems: [],
    collisionCandidates: new Map(),
    filters: { query: '', difficulty: 'all', starredOnly: false },
    selectedProblemId: null,
    details: new Map(),
    activeOperation: null,
    logs: [],
    stale: false,
    lastError: null,
    sourceReadyIds: new Set(),
    testStatuses: new Map(),
    testResults: new Map(),
    submissionStatuses: new Map(),
    submitDialog: closeSubmitDialog(),
    logExpanded: true,
    viewMode: 'all',
    favoritePage: 'folders',
    favoriteFolders: [],
    selectedFavoriteFolderSlug: null,
  })
  let nextLogId = 1
  let activeEditorAbortController: AbortController | null = null
  let activeDetailAbortController: AbortController | null = null
  let pendingDetailLoad: (() => void) | undefined

  const addLog = (
    message: string,
    level: LogLevel = 'info',
    source: LogEntry['source'] = 'app',
  ) => {
    state.logs = appendLogEntries(state.logs, [
      { id: nextLogId++, timestamp: now(), level, message, source },
    ])
  }

  const onLogChunk = ({ stream, text }: GatewayLogChunk): void => {
    for (const line of text.split('\n')) {
      if (line === '') continue
      addLog(line, stream === 'stderr' ? 'error' : 'info', stream)
    }
  }

  const gatewayOptions = (signal?: AbortSignal): GatewayCallOptions =>
    signal === undefined ? { onLogChunk } : { onLogChunk, signal }

  const setError = (error: AppError): void => {
    state.lastError = error
    addLog(`${error.code}: ${error.message}`, 'error')
    if (error.detail !== undefined && error.detail !== '') addLog(error.detail, 'error')
  }

  const beginOperation = (operation: OperationKind): boolean => {
    if (state.activeOperation !== null) {
      addLog(`Operation ${state.activeOperation} is already running.`, 'warn')
      return false
    }
    state.activeOperation = operation
    state.lastError = null
    return true
  }

  const finishOperation = (): void => {
    state.activeOperation = null
    const pending = pendingDetailLoad
    pendingDetailLoad = undefined
    pending?.()
  }

  const selectedFavoriteFolder = (): FavoriteFolder | undefined =>
    state.favoriteFolders.find(({ slug }) => slug === state.selectedFavoriteFolderSlug)

  const replaceFavoriteFolders = (folders: readonly FavoriteFolder[]): void => {
    const selectedStillExists = folders.some(
      ({ slug }) => slug === state.selectedFavoriteFolderSlug,
    )
    state.favoriteFolders = [...folders]
    if (selectedStillExists) return
    state.selectedFavoriteFolderSlug = state.favoriteFolders[0]?.slug ?? null
    state.favoritePage = 'folders'
  }

  const favoriteQuestionFor = (folder: FavoriteFolder, problem: ProblemSummary) =>
    folder.questions.find(
      (question) =>
        (problem.slug !== undefined && question.slug === problem.slug) ||
        question.title.normalize('NFKC').trim().toLocaleLowerCase() ===
          problem.title.normalize('NFKC').trim().toLocaleLowerCase(),
    )

  const visibleProblems = (): ProblemSummary[] => {
    const filtered = filterProblems(state.problems, state.filters)
    if (state.viewMode === 'all') return filtered
    if (state.favoritePage === 'folders') return []
    const folder = selectedFavoriteFolder()
    if (folder === undefined) return []
    const favoriteCandidates = filterProblems(
      [...state.problems, ...[...state.collisionCandidates.values()].flat()],
      state.filters,
    )
    return folder.questions
      .map((question) =>
        favoriteCandidates.find(
          (problem) =>
            problem.slug === question.slug ||
            problem.title.normalize('NFKC').trim().toLocaleLowerCase() ===
              question.title.normalize('NFKC').trim().toLocaleLowerCase(),
        ),
      )
      .filter((problem) => problem !== undefined)
  }

  const syncSelection = (): void => {
    if (state.viewMode === 'favorites' && state.favoritePage === 'folders') {
      state.selectedProblemId = null
      return
    }
    state.selectedProblemId = selectVisibleProblemId(visibleProblems(), state.selectedProblemId)
  }

  const selectedProblem = (id = state.selectedProblemId): ProblemSummary | undefined =>
    id === null ? undefined : state.problems.find((problem) => problem.id === id)

  const replaceProblem = (replacement: ProblemSummary): void => {
    const index = state.problems.findIndex(({ id }) => id === replacement.id)
    if (index >= 0) state.problems[index] = replacement
    syncSelection()
  }

  const resolveIdentity = async (id: number, signal?: AbortSignal): Promise<boolean> => {
    const current = selectedProblem(id)
    if (!current) return false
    if (current.identityStatus === 'resolved' && state.details.has(id)) return true

    const detailResult = await gateway.loadDetail(id, gatewayOptions(signal))
    if (signal?.aborted === true) return false
    if (!detailResult.ok) {
      setError(detailResult.error)
      return false
    }

    const resolution = resolveProblemIdentity(
      current,
      detailResult.value,
      state.collisionCandidates.get(id),
    )
    replaceProblem(resolution.summary)
    state.details.set(id, detailResult.value)

    if (resolution.status === 'conflict') {
      state.sourceReadyIds.delete(id)
      setError({
        code: ERROR_CODES.parse,
        message: `Problem ${id} title did not match any CLI list candidate.`,
      })
      return false
    }

    if (resolution.replaced) {
      addLog(`Problem ${id} identity resolved to ${resolution.summary.title}.`, 'warn')
    }
    return true
  }

  const refresh = async (): Promise<boolean> => {
    if (!beginOperation('refresh-list')) return false
    try {
      addLog('Refreshing LeetCode problems...')
      const listResult = await gateway.listProblems(gatewayOptions())
      if (!listResult.ok) {
        state.stale = true
        setError(listResult.error)
        return false
      }

      state.activeOperation = 'refresh-starred'
      const starredResult = await gateway.listStarred(gatewayOptions())
      if (!starredResult.ok) {
        state.stale = true
        setError(starredResult.error)
        return false
      }

      const starredIds = new Set(starredResult.value.summaries.map(({ id }) => id))
      state.problems = listResult.value.summaries.map((problem) => ({
        ...problem,
        starred: starredIds.has(problem.id),
        identityStatus: 'provisional',
      }))
      state.collisionCandidates = new Map(
        [...listResult.value.collisionCandidates].map(([id, candidates]) => [
          id,
          candidates.map((candidate) => ({
            ...candidate,
            starred: starredIds.has(id),
            identityStatus: 'provisional',
          })),
        ]),
      )
      if (favoritesGateway !== undefined) {
        const favoriteResult = await favoritesGateway.listFolders()
        if (favoriteResult.ok) {
          replaceFavoriteFolders(favoriteResult.value)
        } else {
          replaceFavoriteFolders([])
          addLog(
            `${favoriteResult.error.message} ${favoriteResult.error.detail ?? ''}`.trim(),
            'warn',
          )
        }
      }
      state.details.clear()
      state.sourceReadyIds.clear()
      state.testStatuses.clear()
      state.testResults.clear()
      state.submissionStatuses.clear()
      state.submitDialog = closeSubmitDialog()
      state.stale = false
      state.phase = 'ready'
      syncSelection()
      addLog(`Loaded ${state.problems.length} problem(s).`)
      return true
    } finally {
      finishOperation()
    }
  }

  const loadSelectedDetail = async (): Promise<boolean> => {
    const id = state.selectedProblemId
    if (id === null) return false
    if (state.activeOperation === 'refresh-list' || state.activeOperation === 'refresh-starred') {
      pendingDetailLoad = () => {
        if (state.selectedProblemId === id) void loadSelectedDetail()
      }
      addLog('Detail will load after refresh completes.')
      return true
    }
    if (!beginOperation('load-detail')) return false
    const abortController = new AbortController()
    activeDetailAbortController = abortController
    try {
      return await resolveIdentity(id, abortController.signal)
    } finally {
      if (activeDetailAbortController === abortController) activeDetailAbortController = null
      finishOperation()
    }
  }

  const setEditorBridgeError = (error: unknown): void => {
    if (error instanceof SourceFileError) {
      setError({ code: error.code, message: error.message })
      return
    }
    if (error instanceof EditorBridgeProtocolError) {
      const notConfigured = /connect in time|in time|disconnected before opening/i.test(
        error.message,
      )
      setError({
        code: notConfigured
          ? ERROR_CODES.editorBridgeNotConfigured
          : ERROR_CODES.editorBridgeProtocol,
        message: notConfigured
          ? 'The le-e editor bridge is not configured or did not connect.'
          : 'The le-e editor bridge protocol failed.',
        detail: error.message,
      })
      return
    }
    setError({
      code: ERROR_CODES.editorBridgeProtocol,
      message: 'Vim could not be opened through the editor bridge.',
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  const editSelected = async (): Promise<boolean> => {
    const id = state.selectedProblemId
    if (
      id === null ||
      editorBridge === undefined ||
      vimEditor === undefined ||
      !beginOperation('edit')
    ) {
      return false
    }

    const abortController = new AbortController()
    activeEditorAbortController = abortController
    let bridge: SourceBridgeSession | undefined
    let editPromise: ReturnType<LeetCodeGateway['edit']> | undefined
    let commandCompleted = false
    let terminalSuspended = false
    let restored = true
    let succeeded = false

    try {
      if (!(await resolveIdentity(id, abortController.signal))) return false
      bridge = await editorBridge.createBridge({ signal: abortController.signal })
      editPromise = gateway.edit(id, {
        ...gatewayOptions(),
        signal: abortController.signal,
        bridgeEnvironment: bridge.environment,
      })

      const openResult = await Promise.race([
        bridge.waitForOpen().then((request) => ({ kind: 'open' as const, request })),
        editPromise.then((result) => ({ kind: 'command' as const, result })),
      ])
      if (openResult.kind === 'command') {
        commandCompleted = true
        if (!openResult.result.ok) setError(openResult.result.error)
        else {
          setError({
            code: ERROR_CODES.editorBridgeNotConfigured,
            message: 'The edit command exited before the le-e editor bridge connected.',
          })
        }
        return false
      }

      const document = await editorBridge.loadSource(openResult.request.path)
      terminalSuspended = true
      await suspendForEditor()
      await vimEditor.open(document.path, { signal: abortController.signal })
      await editorBridge.loadSource(document.path)
      await bridge.complete()

      const editResult = await editPromise
      commandCompleted = true
      if (!editResult.ok) {
        setError(editResult.error)
        return false
      }

      state.sourceReadyIds.add(id)
      addLog(`Vim saved the JavaScript source for problem ${id}.`)
      succeeded = true
    } catch (error) {
      if (!abortController.signal.aborted) {
        await bridge?.reject('The Vim editor handoff failed.').catch(() => {})
        if (error instanceof SourceFileError || error instanceof EditorBridgeProtocolError) {
          setEditorBridgeError(error)
        } else {
          setError({
            code: ERROR_CODES.terminalRestore,
            message: 'The Vim editor handoff failed.',
            detail: error instanceof Error ? error.message : String(error),
          })
        }
      }
    } finally {
      if (terminalSuspended) {
        try {
          await resumeAfterEditor()
        } catch (error) {
          restored = false
          state.phase = 'error'
          setError({
            code: ERROR_CODES.terminalRestore,
            message: 'The terminal could not be restored after Vim exited.',
            detail: error instanceof Error ? error.message : String(error),
          })
        }
      }
      if (activeEditorAbortController === abortController) activeEditorAbortController = null
      abortController.abort()
      if (editPromise !== undefined && !commandCompleted) await editPromise.catch(() => {})
      await bridge?.dispose().catch(() => {})
      if (!restored) state.sourceReadyIds.delete(id)
      finishOperation()
    }
    return succeeded && restored
  }

  const testSelected = async (): Promise<boolean> => {
    const id = state.selectedProblemId
    const problem = selectedProblem(id)
    if (id === null || problem?.identityStatus !== 'resolved' || !state.sourceReadyIds.has(id)) {
      addLog('Press e first to prepare and confirm the JavaScript source.', 'warn')
      return false
    }
    if (!beginOperation('test')) return false

    state.testStatuses.set(id, 'running')
    state.testResults.delete(id)
    try {
      const result = await gateway.test(id, gatewayOptions())
      if (!result.ok) {
        state.testStatuses.set(id, 'unknown')
        setError(result.error)
        return false
      }
      if (result.value.result.kind !== 'test') {
        state.testStatuses.set(id, 'unknown')
        setError({ code: ERROR_CODES.parse, message: 'Gateway returned a non-test result.' })
        return false
      }
      state.testStatuses.set(id, result.value.result.outcome)
      state.testResults.set(id, result.value.result)
      addLog(`Test ${id}: ${result.value.result.message}`)
      return true
    } finally {
      finishOperation()
    }
  }

  const openSubmitDialog = (): boolean => {
    const id = state.selectedProblemId
    const problem = selectedProblem(id)
    if (id === null || problem?.identityStatus !== 'resolved' || !state.sourceReadyIds.has(id)) {
      addLog('Press e first to prepare and confirm the JavaScript source.', 'warn')
      return false
    }
    if (state.activeOperation !== null) {
      addLog(`Operation ${state.activeOperation} is already running.`, 'warn')
      return false
    }
    state.submitDialog = createOpenSubmitDialog(id)
    return true
  }

  const submitProblem = async (id: number): Promise<boolean> => {
    const problem = selectedProblem(id)
    if (problem?.identityStatus !== 'resolved' || !state.sourceReadyIds.has(id)) return false
    if (!beginOperation('submit')) return false

    state.submissionStatuses.set(id, 'running')
    try {
      const result = await gateway.submit(id, gatewayOptions())
      if (!result.ok) {
        state.submissionStatuses.set(id, 'unknown')
        setError(result.error)
        return false
      }
      if (result.value.result.kind !== 'submit') {
        state.submissionStatuses.set(id, 'unknown')
        setError({ code: ERROR_CODES.parse, message: 'Gateway returned a non-submit result.' })
        return false
      }
      state.submissionStatuses.set(id, result.value.result.outcome)
      addLog(`Submit ${id}: ${result.value.result.message}`)
      return true
    } finally {
      finishOperation()
    }
  }

  return {
    state,
    async start() {
      if (!beginOperation('preflight')) return false
      state.phase = 'starting'
      try {
        const result = await gateway.preflight(gatewayOptions())
        if (!result.ok) {
          state.phase = 'error'
          setError(result.error)
          return false
        }
        state.cliVersion = result.value.version
        state.cliVersionSupported = result.value.supported
        if (!result.value.supported) {
          addLog(`CLI ${result.value.version} is outside the verified compatibility range.`, 'warn')
        }
      } finally {
        finishOperation()
      }
      return refresh()
    },
    refresh,
    visibleProblems,
    setQuery(query) {
      state.filters = { ...state.filters, query }
      syncSelection()
    },
    setDifficulty(difficulty) {
      state.filters = { ...state.filters, difficulty }
      syncSelection()
    },
    toggleStarredOnly() {
      state.filters = { ...state.filters, starredOnly: !state.filters.starredOnly }
      syncSelection()
    },
    toggleView() {
      activeDetailAbortController?.abort()
      if (state.viewMode === 'all') {
        state.viewMode = 'favorites'
        state.favoritePage = 'folders'
      } else {
        state.viewMode = 'all'
      }
      syncSelection()
    },
    moveFavoriteFolder(delta) {
      if (state.favoriteFolders.length === 0) return
      activeDetailAbortController?.abort()
      if (state.viewMode === 'all') state.favoritePage = 'folders'
      const index = state.favoriteFolders.findIndex(
        ({ slug }) => slug === state.selectedFavoriteFolderSlug,
      )
      const start = index < 0 ? 0 : index
      const next = (start + delta + state.favoriteFolders.length) % state.favoriteFolders.length
      state.selectedFavoriteFolderSlug = state.favoriteFolders[next]?.slug ?? null
      state.viewMode = 'favorites'
      syncSelection()
    },
    openFavoriteFolder(slug = state.selectedFavoriteFolderSlug ?? undefined) {
      if (slug === undefined || !state.favoriteFolders.some((folder) => folder.slug === slug)) {
        return false
      }
      activeDetailAbortController?.abort()
      state.selectedFavoriteFolderSlug = slug
      state.viewMode = 'favorites'
      state.favoritePage = 'questions'
      syncSelection()
      return true
    },
    closeFavoriteFolder() {
      if (state.viewMode !== 'favorites' || state.favoritePage !== 'questions') return false
      activeDetailAbortController?.abort()
      state.favoritePage = 'folders'
      syncSelection()
      return true
    },
    async toggleFavoriteSelected() {
      const problem = selectedProblem()
      const folder = selectedFavoriteFolder()
      if (problem === undefined || folder === undefined || favoritesGateway === undefined) {
        addLog('没有可用的收藏夹，请先运行 pnpm setup:account。', 'warn')
        return false
      }
      if (!folder.writable) {
        addLog('当前收藏夹是只读的，不能修改。', 'warn')
        return false
      }
      const existing = favoriteQuestionFor(folder, problem)
      const questionSlug = existing?.slug ?? problem.slug
      if (questionSlug === undefined) {
        addLog('无法确定这道题的 LeetCode slug。', 'error')
        return false
      }
      if (!beginOperation('favorite')) return false
      try {
        const result =
          existing === undefined
            ? await favoritesGateway.add(folder.slug, questionSlug)
            : await favoritesGateway.remove(folder.slug, questionSlug)
        if (!result.ok) {
          setError(result.error)
          return false
        }
        const refreshed = await favoritesGateway.listFolders()
        if (!refreshed.ok) {
          setError(refreshed.error)
          return false
        }
        replaceFavoriteFolders(refreshed.value)
        const isStarred = state.favoriteFolders.some((candidate) =>
          favoriteQuestionFor(candidate, problem),
        )
        replaceProblem({ ...problem, starred: isStarred })
        addLog(
          existing === undefined
            ? `已收藏 #${problem.id} 到 ${folder.name}。`
            : `已从 ${folder.name} 取消收藏 #${problem.id}。`,
        )
        return true
      } finally {
        finishOperation()
      }
    },
    selectProblem(id) {
      if (visibleProblems().some((problem) => problem.id === id)) {
        if (state.selectedProblemId !== id) activeDetailAbortController?.abort()
        state.selectedProblemId = id
      }
    },
    moveSelection(delta) {
      if (state.viewMode === 'favorites' && state.favoritePage === 'folders') {
        this.moveFavoriteFolder(delta)
        return
      }
      const visible = visibleProblems()
      if (visible.length === 0) {
        state.selectedProblemId = null
        return
      }
      const currentIndex = visible.findIndex(({ id }) => id === state.selectedProblemId)
      const start = currentIndex < 0 ? 0 : currentIndex
      const next = Math.min(visible.length - 1, Math.max(0, start + delta))
      const nextId = visible[next]?.id ?? null
      if (state.selectedProblemId !== nextId) activeDetailAbortController?.abort()
      state.selectedProblemId = nextId
    },
    loadSelectedDetail,
    editSelected,
    dispose() {
      activeEditorAbortController?.abort()
      activeDetailAbortController?.abort()
    },
    testSelected,
    openSubmitDialog,
    async handleSubmitDialogKey(key) {
      const transition = transitionSubmitDialog(state.submitDialog, key)
      state.submitDialog = transition.state
      return transition.confirmedProblemId === null
        ? false
        : submitProblem(transition.confirmedProblemId)
    },
    toggleLog() {
      state.logExpanded = !state.logExpanded
    },
  }
}
