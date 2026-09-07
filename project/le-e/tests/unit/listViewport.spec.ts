import { describe, expect, it } from 'vitest'

import { borderedListContentRows, nextListWindowStart } from '../../src/components/listViewport'

describe('bordered list viewport', () => {
  it('keeps the page-boundary selection inside the drawable rows', () => {
    const rows = borderedListContentRows(21)
    const selectedIndex = 18
    const start = nextListWindowStart(0, selectedIndex, rows, 100)

    expect(rows).toBe(18)
    expect(start).toBe(1)
    expect(selectedIndex).toBeLessThan(start + rows)
  })

  it('keeps the first page anchored at the beginning', () => {
    const rows = borderedListContentRows(21)

    expect(nextListWindowStart(0, 0, rows, 100)).toBe(0)
    expect(nextListWindowStart(0, 17, rows, 100)).toBe(0)
  })

  it('does not move upward until selection leaves the current top row', () => {
    const rows = 3

    expect(nextListWindowStart(5, 6, rows, 20)).toBe(5)
    expect(nextListWindowStart(5, 5, rows, 20)).toBe(5)
    expect(nextListWindowStart(5, 4, rows, 20)).toBe(4)
  })

  it('clamps retained state when filtering or resizing shortens the viewport range', () => {
    expect(nextListWindowStart(80, 5, 18, 10)).toBe(0)
    expect(nextListWindowStart(50, 52, 60, 100)).toBe(40)
  })
})
