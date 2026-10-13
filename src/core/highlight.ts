import type { HighlightSegment } from '../types'

/**
 * Split `text` into segments, marking characters whose index is in `indices` as matched.
 * Adjacent characters with the same state are merged into one segment.
 */
export function highlight(text: string, indices: readonly number[]): HighlightSegment[] {
  if (text.length === 0) return []
  if (indices.length === 0) return [{ text, match: false }]

  const matched = new Set(indices)
  const segments: HighlightSegment[] = []
  let current = ''
  let currentMatch = matched.has(0)

  for (let i = 0; i < text.length; i++) {
    const isMatch = matched.has(i)
    if (isMatch !== currentMatch && current) {
      segments.push({ text: current, match: currentMatch })
      current = ''
    }
    currentMatch = isMatch
    current += text.charAt(i)
  }
  if (current) segments.push({ text: current, match: currentMatch })
  return segments
}
