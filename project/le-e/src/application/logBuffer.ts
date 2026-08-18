import { RUNTIME_CONFIG } from '../config/runtime'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  readonly id: number
  readonly timestamp: number
  readonly level: LogLevel
  readonly message: string
  readonly source?: 'app' | 'stdout' | 'stderr'
}

export function appendLogEntries(
  existing: readonly LogEntry[],
  incoming: readonly LogEntry[],
  limit: number = RUNTIME_CONFIG.logLineLimit,
): LogEntry[] {
  if (limit <= 0) return []
  return [...existing, ...incoming].slice(-limit)
}
