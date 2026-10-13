import type { CommandItem, ResultItem, ResultSection } from '../types'
import { matchFields } from './fuzzy'
import { highlight } from './highlight'

export const DEFAULT_GROUP = '__default__'

interface Candidate {
  item: CommandItem
  path: string[]
}

/** Walk an item tree depth-first, collecting every item with its breadcrumb path. */
export function flattenItems(items: readonly CommandItem[], path: string[] = []): Candidate[] {
  const out: Candidate[] = []
  for (const item of items) {
    out.push({ item, path })
    const children = item.page?.items
    if (children?.length) {
      out.push(...flattenItems(children, [...path, item.page?.title ?? item.title]))
    }
  }
  return out
}

/** Find an item anywhere in the tree by id. */
export function findItemById(items: readonly CommandItem[], id: string): CommandItem | undefined {
  for (const item of items) {
    if (item.id === id) return item
    const children = item.page?.items
    if (children) {
      const found = findItemById(children, id)
      if (found) return found
    }
  }
  return undefined
}

export function toResult(item: CommandItem, score: number, indices: number[], path: string[], keyPrefix = 's', sourceId?: string): ResultItem {
  return {
    key: `${keyPrefix}:${item.id}`,
    item,
    score,
    indices,
    segments: highlight(item.title, indices),
    path,
    sourceId,
  }
}

export interface RankOptions {
  /** Also search items inside nested pages when the query is not empty. */
  nested?: boolean
  /** Maximum number of results. */
  limit?: number
  keyPrefix?: string
  sourceId?: string
}

/**
 * Filter and rank items by `query`. An empty query returns items in their original order.
 * Ranking is stable: equal scores keep definition order.
 */
export function rankItems(items: readonly CommandItem[], query: string, options: RankOptions = {}): ResultItem[] {
  const { nested = false, limit = Infinity, keyPrefix = 's', sourceId } = options
  const trimmed = query.trim()

  if (!trimmed) {
    return items.slice(0, limit).map((item) => toResult(item, 0, [], [], keyPrefix, sourceId))
  }

  const candidates = nested ? flattenItems(items) : items.map((item) => ({ item, path: [] as string[] }))
  const seen = new Set<string>()
  const scored: { result: ResultItem; order: number }[] = []

  candidates.forEach(({ item, path }, order) => {
    if (seen.has(item.id)) return
    const match = matchFields(trimmed, item)
    if (!match) return
    seen.add(item.id)
    // Nested matches rank a little lower than top-level ones with the same score.
    const score = match.score - path.length * 5
    scored.push({ result: toResult(item, score, match.titleIndices, path, keyPrefix, sourceId), order })
  })

  scored.sort((a, b) => b.result.score - a.result.score || a.order - b.order)
  return scored.slice(0, limit).map((s) => s.result)
}

/**
 * Group results into sections by `item.group` (or the breadcrumb for nested matches).
 * With `byScore`, sections are ordered by their best item; otherwise by first appearance.
 */
export function groupResults(results: readonly ResultItem[], byScore: boolean): ResultSection[] {
  const sections = new Map<string, ResultSection & { best: number; order: number }>()
  results.forEach((r, order) => {
    const label = r.item.group ?? (r.path.length ? r.path.join(' › ') : undefined)
    const id = label ?? DEFAULT_GROUP
    let section = sections.get(id)
    if (!section) {
      section = { id, label, items: [], best: r.score, order }
      sections.set(id, section)
    }
    section.items.push(r)
    if (r.score > section.best) section.best = r.score
  })
  const list = [...sections.values()]
  if (byScore) list.sort((a, b) => b.best - a.best || a.order - b.order)
  return list.map(({ id, label, items }) => ({ id, label, items }))
}
