import { describe, expect, it } from 'vitest'

import {
  closeSubmitDialog,
  handleSubmitDialogKey,
  openSubmitDialog,
} from '../../src/application/submitState'

describe('submitState', () => {
  it('opens for one problem and defaults every cancel key to no submission', () => {
    const opened = openSubmitDialog(1)

    expect(opened).toEqual({ open: true, problemId: 1 })
    for (const key of ['Enter', 'Escape', 'n', 'N']) {
      expect(handleSubmitDialogKey(opened, key)).toEqual({
        state: { open: false, problemId: null },
        confirmedProblemId: null,
      })
    }
  })

  it('confirms only y and ignores unrelated keys', () => {
    const opened = openSubmitDialog(72)

    expect(handleSubmitDialogKey(opened, '?')).toEqual({
      state: opened,
      confirmedProblemId: null,
    })
    expect(handleSubmitDialogKey(opened, 'Y')).toEqual({
      state: { open: false, problemId: null },
      confirmedProblemId: 72,
    })
    expect(handleSubmitDialogKey(closeSubmitDialog(), 'y').confirmedProblemId).toBeNull()
  })
})
