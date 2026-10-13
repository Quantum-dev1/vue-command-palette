import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AsyncSearch, type SourceState } from '../src/core/async-search'
import type { CommandItem, CommandSource } from '../src/types'

interface Deferred {
  query: string
  signal: AbortSignal
  resolve: (items: CommandItem[]) => void
  reject: (error: unknown) => void
}

function controllableSource(overrides: Partial<CommandSource> = {}): { source: CommandSource; calls: Deferred[] } {
  const calls: Deferred[] = []
  const source: CommandSource = {
    id: 'remote',
    debounce: 100,
    fetch: (query, signal) =>
      new Promise<CommandItem[]>((resolve, reject) => {
        calls.push({ query, signal, resolve, reject })
      }),
    ...overrides,
  }
  return { source, calls }
}

const items = (...titles: string[]): CommandItem[] => titles.map((t) => ({ id: t, title: t }))

describe('AsyncSearch', () => {
  let latest: ReadonlyMap<string, SourceState>
  let search: AsyncSearch

  beforeEach(() => {
    vi.useFakeTimers()
    search = new AsyncSearch((s) => {
      latest = new Map(s)
    })
  })

  afterEach(() => {
    search.dispose()
    vi.useRealTimers()
  })

  it('debounces rapid typing into a single request', async () => {
    const { source, calls } = controllableSource()
    for (const q of ['r', 're', 'rep', 'repo']) {
      search.run([source], q)
      await vi.advanceTimersByTimeAsync(50)
    }
    expect(calls).toHaveLength(0)
    expect(latest.get('remote')?.loading).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(calls.map((c) => c.query)).toEqual(['repo'])
  })

  it('ignores a slow stale response that resolves after a newer one (race condition)', async () => {
    const { source, calls } = controllableSource()

    search.run([source], 'vu')
    await vi.advanceTimersByTimeAsync(100)
    search.run([source], 'vue')
    await vi.advanceTimersByTimeAsync(100)
    expect(calls.map((c) => c.query)).toEqual(['vu', 'vue'])

    // The first request was superseded and aborted.
    expect(calls[0]!.signal.aborted).toBe(true)
    expect(calls[1]!.signal.aborted).toBe(false)

    // Newer response arrives first…
    calls[1]!.resolve(items('vue-router'))
    await vi.advanceTimersByTimeAsync(0)
    expect(latest.get('remote')?.items.map((i) => i.title)).toEqual(['vue-router'])

    // …then the stale one lands late and must be ignored, even if the fetcher ignores the signal.
    calls[0]!.resolve(items('vuetify', 'vuex'))
    await vi.advanceTimersByTimeAsync(0)
    expect(latest.get('remote')?.items.map((i) => i.title)).toEqual(['vue-router'])
    expect(latest.get('remote')?.loading).toBe(false)
  })

  it('stays loading until the latest request settles', async () => {
    const { source, calls } = controllableSource()
    search.run([source], 'a')
    await vi.advanceTimersByTimeAsync(100)
    search.run([source], 'ab')
    await vi.advanceTimersByTimeAsync(100)
    calls[0]!.resolve(items('stale'))
    await vi.advanceTimersByTimeAsync(0)
    expect(latest.get('remote')?.loading).toBe(true)
    calls[1]!.resolve(items('fresh'))
    await vi.advanceTimersByTimeAsync(0)
    expect(latest.get('remote')).toMatchObject({ loading: false, query: 'ab' })
  })

  it('records errors from the latest request only', async () => {
    const { source, calls } = controllableSource()
    search.run([source], 'x')
    await vi.advanceTimersByTimeAsync(100)
    calls[0]!.reject(new Error('boom'))
    await vi.advanceTimersByTimeAsync(0)
    expect(latest.get('remote')?.error).toBeInstanceOf(Error)
    expect(latest.get('remote')?.loading).toBe(false)
  })

  it('handles fetchers that throw synchronously', async () => {
    const source: CommandSource = {
      id: 'sync-throw',
      debounce: 0,
      fetch: () => {
        throw new Error('sync')
      },
    }
    search.run([source], 'x')
    await vi.advanceTimersByTimeAsync(0)
    expect(latest.get('sync-throw')?.error).toBeInstanceOf(Error)
  })

  it('skips queries shorter than minQueryLength', async () => {
    const { source, calls } = controllableSource({ minQueryLength: 2 })
    search.run([source], 'a')
    await vi.advanceTimersByTimeAsync(500)
    expect(calls).toHaveLength(0)
    expect(latest.get('remote')).toMatchObject({ loading: false, items: [] })
  })

  it('aborts in-flight requests on reset and drops removed sources', async () => {
    const { source, calls } = controllableSource()
    search.run([source], 'abc')
    await vi.advanceTimersByTimeAsync(100)
    search.run([], 'abc')
    expect(calls[0]!.signal.aborted).toBe(true)
    expect(latest.has('remote')).toBe(false)
  })
})
