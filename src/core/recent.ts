/**
 * Persistent most-recently-used list of item ids.
 * Falls back to in-memory storage when localStorage is unavailable (SSR, privacy mode).
 */
export interface RecentStore {
  get(): string[]
  push(id: string): void
  clear(): void
}

function safeStorage(): Storage | undefined {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return undefined
    const probe = '__vcp_probe__'
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return undefined
  }
}

export function createRecentStore(storageKey = 'vcp:recent', max = 5): RecentStore {
  const storage = safeStorage()
  let memory: string[] = []

  const read = (): string[] => {
    if (!storage) return memory
    try {
      const raw = storage.getItem(storageKey)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }

  const write = (ids: string[]): void => {
    memory = ids
    if (!storage) return
    try {
      storage.setItem(storageKey, JSON.stringify(ids))
    } catch {
      /* quota exceeded or storage disabled: keep in memory */
    }
  }

  return {
    get: () => read().slice(0, max),
    push(id) {
      write([id, ...read().filter((x) => x !== id)].slice(0, max))
    },
    clear() {
      write([])
    },
  }
}
