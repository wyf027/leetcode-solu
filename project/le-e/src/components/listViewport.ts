export const borderedListContentRows = (height: number): number =>
  Math.max(1, Math.floor(height) - 3)

export const nextListWindowStart = (
  currentStart: number,
  selectedIndex: number,
  contentRows: number,
  itemCount: number,
): number => {
  const length = Math.max(0, Math.floor(itemCount))
  if (length === 0) return 0

  const rows = Math.max(1, Math.floor(contentRows))
  const maximumStart = Math.max(0, length - rows)
  const start = Math.min(maximumStart, Math.max(0, Math.floor(currentStart)))
  if (selectedIndex < 0) return start

  const selected = Math.min(length - 1, Math.floor(selectedIndex))
  if (selected < start) return selected
  if (selected >= start + rows) return Math.min(maximumStart, selected - rows + 1)
  return start
}
