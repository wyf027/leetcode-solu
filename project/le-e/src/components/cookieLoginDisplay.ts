export function maskTokenInput(length: number, maximumWidth: number): string {
  if (length <= 0) return '粘贴 Token...'
  return '•'.repeat(Math.min(Math.max(1, Math.floor(maximumWidth)), Math.floor(length)))
}

export function cookieTokenFieldTitle(label: string, active: boolean): string {
  return `${active ? '> ' : ''}${label}`
}
