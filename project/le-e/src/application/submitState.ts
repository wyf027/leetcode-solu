export interface SubmitDialogState {
  readonly open: boolean
  readonly problemId: number | null
}

export interface SubmitDialogTransition {
  readonly state: SubmitDialogState
  readonly confirmedProblemId: number | null
}

export function closeSubmitDialog(): SubmitDialogState {
  return { open: false, problemId: null }
}

export function openSubmitDialog(problemId: number): SubmitDialogState {
  return { open: true, problemId }
}

export function handleSubmitDialogKey(
  state: SubmitDialogState,
  key: string,
): SubmitDialogTransition {
  if (!state.open || state.problemId === null) {
    return { state, confirmedProblemId: null }
  }

  if (key.toLocaleLowerCase() === 'y') {
    return { state: closeSubmitDialog(), confirmedProblemId: state.problemId }
  }

  if (key === 'Enter' || key === 'Escape' || key.toLocaleLowerCase() === 'n') {
    return { state: closeSubmitDialog(), confirmedProblemId: null }
  }

  return { state, confirmedProblemId: null }
}
