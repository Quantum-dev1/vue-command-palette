import type { CommandItem, CommandSource } from '../types'

export interface SourceState {
  items: CommandItem[]
  loading: boolean
  error: unknown
  /** The query these items belong to. */
  query: string
}

interface Slot {
  timer: ReturnType<typeof setTimeout> | undefined
  controller: AbortController | undefined
  seq: number
}

export const DEFAULT_DEBOUNCE = 200

/**
 * Coordinates debounced, cancellable calls to async sources.
 *
 * Race-condition safety: every scheduled call gets a sequence number. A response is applied only
 * if its sequence number is still the latest for that source, so a slow response for an old query
 * can never overwrite results for a newer one. Superseded requests are also aborted via AbortSignal.
 */
export class AsyncSearch {
  private slots = new Map<string, Slot>()
  private states = new Map<string, SourceState>()
  private disposed = false

  constructor(private readonly onChange: (states: ReadonlyMap<string, SourceState>) => void) {}

  get snapshot(): ReadonlyMap<string, SourceState> {
    return this.states
  }

  /** Schedule a search on every source for `query`. Sources no longer present are dropped. */
  run(sources: readonly CommandSource[], query: string): void {
    if (this.disposed) return
    const ids = new Set(sources.map((s) => s.id))
    for (const id of [...this.slots.keys()]) {
      if (!ids.has(id)) this.cancelSlot(id, true)
    }
    for (const source of sources) this.schedule(source, query)
    this.emit()
  }

  /** Abort everything and clear state. */
  reset(): void {
    for (const id of [...this.slots.keys()]) this.cancelSlot(id, true)
    this.emit()
  }

  dispose(): void {
    this.reset()
    this.disposed = true
  }

  private slot(id: string): Slot {
    let s = this.slots.get(id)
    if (!s) {
      s = { timer: undefined, controller: undefined, seq: 0 }
      this.slots.set(id, s)
    }
    return s
  }

  private cancelSlot(id: string, remove: boolean): void {
    const s = this.slots.get(id)
    if (s) {
      if (s.timer !== undefined) clearTimeout(s.timer)
      s.controller?.abort()
      s.timer = undefined
      s.controller = undefined
      s.seq++
    }
    if (remove) {
      this.slots.delete(id)
      this.states.delete(id)
    }
  }

  private schedule(source: CommandSource, query: string): void {
    const trimmed = query.trim()
    this.cancelSlot(source.id, false)
    const slot = this.slot(source.id)
    const prev = this.states.get(source.id)

    if (trimmed.length < (source.minQueryLength ?? 1)) {
      this.states.set(source.id, { items: [], loading: false, error: undefined, query })
      return
    }

    // Keep previous items visible while loading to avoid flicker.
    this.states.set(source.id, { items: prev?.items ?? [], loading: true, error: undefined, query: prev?.query ?? query })
    const seq = slot.seq

    slot.timer = setTimeout(() => {
      slot.timer = undefined
      if (slot.seq !== seq) return
      const controller = new AbortController()
      slot.controller = controller
      let promise: Promise<CommandItem[]>
      try {
        promise = Promise.resolve(source.fetch(trimmed, controller.signal))
      } catch (error) {
        promise = Promise.reject(error)
      }
      promise.then(
        (items) => {
          if (slot.seq !== seq || controller.signal.aborted || this.disposed) return
          slot.controller = undefined
          this.states.set(source.id, { items: Array.isArray(items) ? items : [], loading: false, error: undefined, query })
          this.emit()
        },
        (error: unknown) => {
          if (slot.seq !== seq || controller.signal.aborted || this.disposed) return
          slot.controller = undefined
          this.states.set(source.id, { items: [], loading: false, error, query })
          this.emit()
        },
      )
    }, source.debounce ?? DEFAULT_DEBOUNCE)
  }

  private emit(): void {
    this.onChange(this.states)
  }
}
