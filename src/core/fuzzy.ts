/**
 * Fuzzy matcher with match positions.
 *
 * Scoring is an optimal-alignment dynamic program (O(query × target)) in the spirit of
 * fzf / VS Code quick open: matched characters earn points, with bonuses for word starts,
 * camelCase humps and consecutive runs, and penalties for gaps and late starts.
 */

export interface FuzzyMatch {
  score: number
  /** Indices of matched characters in the target string, ascending. */
  indices: number[]
}

const SCORE_MATCH = 16
const BONUS_BOUNDARY = 24
const BONUS_FIRST_CHAR = 12
const BONUS_CAMEL = 18
const BONUS_CONSECUTIVE = 20
const PENALTY_GAP = 3
const PENALTY_LEADING = 2
const MAX_LEADING_PENALTY = 20
const BONUS_EXACT = 60
const BONUS_PREFIX = 30
const BONUS_CONTIGUOUS = 25
/** Multi-character terms must average at least this many points per character; weaker scattered matches are dropped. */
const MIN_SCORE_PER_CHAR = 8

const SEPARATOR = /[\s\-_/.:,()[\]|>]/

function isUpper(ch: string): boolean {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase()
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

/** Positional bonus for matching the character at `j`. */
function positionBonus(target: string, j: number): number {
  if (j === 0) return BONUS_BOUNDARY + BONUS_FIRST_CHAR
  const prev = target.charAt(j - 1)
  const cur = target.charAt(j)
  if (SEPARATOR.test(prev)) return BONUS_BOUNDARY
  if (!isUpper(prev) && isUpper(cur)) return BONUS_CAMEL
  if (!isDigit(prev) && isDigit(cur)) return BONUS_CAMEL / 2
  return 0
}

/** Fast check that every query char appears in order in the target. */
function isSubsequence(q: string, t: string): boolean {
  let i = 0
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t.charCodeAt(j) === q.charCodeAt(i)) i++
  }
  return i === q.length
}

/**
 * Match a single search term (no whitespace splitting) against `target`.
 * Returns `null` when the term is not a subsequence of the target.
 */
export function fuzzyMatch(term: string, target: string): FuzzyMatch | null {
  const q = term.toLowerCase()
  const t = target.toLowerCase()
  const m = q.length
  const n = t.length
  if (m === 0) return { score: 0, indices: [] }
  if (m > n || !isSubsequence(q, t)) return null

  const NEG = -Infinity
  // score[i * n + j] = best score with q[i] matched at t[j]
  const score = new Float64Array(m * n).fill(NEG)
  const back = new Int32Array(m * n).fill(-1)

  for (let j = 0; j < n; j++) {
    if (t.charCodeAt(j) !== q.charCodeAt(0)) continue
    const leading = Math.min(j * PENALTY_LEADING, MAX_LEADING_PENALTY)
    score[j] = SCORE_MATCH + positionBonus(target, j) - leading
  }

  for (let i = 1; i < m; i++) {
    const row = i * n
    const prevRow = (i - 1) * n
    // Running max of score[i-1][k] + PENALTY_GAP * k over k <= j - 2 (non-adjacent predecessors).
    let runMax = NEG
    let runArg = -1
    for (let j = i; j < n; j++) {
      const k = j - 2
      if (k >= 0) {
        const v = score[prevRow + k]! + PENALTY_GAP * k
        if (v > runMax) {
          runMax = v
          runArg = k
        }
      }
      if (t.charCodeAt(j) !== q.charCodeAt(i)) continue

      let best = NEG
      let arg = -1
      const adjacent = score[prevRow + j - 1]!
      if (adjacent > NEG) {
        best = adjacent + BONUS_CONSECUTIVE
        arg = j - 1
      }
      if (runMax > NEG) {
        const gapped = runMax - PENALTY_GAP * (j - 1)
        if (gapped > best) {
          best = gapped
          arg = runArg
        }
      }
      if (arg === -1) continue
      score[row + j] = best + SCORE_MATCH + positionBonus(target, j)
      back[row + j] = arg
    }
  }

  const lastRow = (m - 1) * n
  let bestScore = NEG
  let bestEnd = -1
  for (let j = m - 1; j < n; j++) {
    const v = score[lastRow + j]!
    if (v > bestScore) {
      bestScore = v
      bestEnd = j
    }
  }
  if (bestEnd === -1) return null

  const indices = new Array<number>(m)
  let j = bestEnd
  for (let i = m - 1; i >= 0; i--) {
    indices[i] = j
    j = back[i * n + j]!
  }

  let total = bestScore
  if (q === t) total += BONUS_EXACT
  else if (t.startsWith(q)) total += BONUS_PREFIX
  else if (m > 1 && indices[m - 1]! - indices[0]! === m - 1) total += BONUS_CONTIGUOUS
  // Slight preference for shorter targets so "Theme" beats "Theme settings (advanced)".
  total -= (n - m) * 0.1

  if (m >= 2 && total < m * MIN_SCORE_PER_CHAR) return null
  return { score: total, indices }
}

/** Split a query into whitespace-separated terms. */
export function tokenize(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean)
}

export interface SearchFields {
  title: string
  subtitle?: string
  keywords?: readonly string[]
}

export interface FieldMatch {
  score: number
  /** Matched indices within `title` (keyword/subtitle matches are not highlighted). */
  titleIndices: number[]
}

const KEYWORD_WEIGHT = 0.8
const SUBTITLE_WEIGHT = 0.5

/**
 * Match a full (possibly multi-word) query against an item's searchable fields.
 * Every term must match at least one field; terms may match in any order.
 */
export function matchFields(query: string, fields: SearchFields): FieldMatch | null {
  const terms = tokenize(query)
  if (terms.length === 0) return { score: 0, titleIndices: [] }

  let total = 0
  const titleIndices = new Set<number>()
  for (const term of terms) {
    let best = -Infinity
    const title = fuzzyMatch(term, fields.title)
    if (title) {
      best = title.score
      for (const idx of title.indices) titleIndices.add(idx)
    }
    for (const kw of fields.keywords ?? []) {
      const r = fuzzyMatch(term, kw)
      if (r && r.score * KEYWORD_WEIGHT > best) best = r.score * KEYWORD_WEIGHT
    }
    if (fields.subtitle) {
      const r = fuzzyMatch(term, fields.subtitle)
      if (r && r.score * SUBTITLE_WEIGHT > best) best = r.score * SUBTITLE_WEIGHT
    }
    if (best === -Infinity) return null
    total += best
  }
  return { score: total, titleIndices: [...titleIndices].sort((a, b) => a - b) }
}
