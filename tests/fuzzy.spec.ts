import { describe, expect, it } from 'vitest'
import { fuzzyMatch, matchFields, tokenize } from '../src/core/fuzzy'
import { highlight } from '../src/core/highlight'
import { groupResults, rankItems } from '../src/core/search'
import type { CommandItem } from '../src/types'

const score = (q: string, t: string): number => fuzzyMatch(q, t)?.score ?? -Infinity

describe('fuzzyMatch', () => {
  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyMatch('xyz', 'Open settings')).toBeNull()
    expect(fuzzyMatch('settingsx', 'settings')).toBeNull()
  })

  it('matches case-insensitively and reports indices', () => {
    expect(fuzzyMatch('OPS', 'Open settings')?.indices).toEqual([0, 1, 5])
  })

  it('empty term matches with zero score', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, indices: [] })
  })

  it('ranks exact > prefix > substring > scattered', () => {
    const exact = score('theme', 'Theme')
    const prefix = score('theme', 'Theme settings')
    const substring = score('theme', 'Change theme')
    const scattered = score('theme', 'The home menu')
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(substring)
    expect(substring).toBeGreaterThan(scattered)
  })

  it('prefers word-boundary matches (acronyms)', () => {
    // "gs" should hit the G of "Go" and the S of "Settings", not letters inside words.
    expect(fuzzyMatch('gs', 'Go to Settings')?.indices).toEqual([0, 6])
    expect(score('gs', 'Go to Settings')).toBeGreaterThan(score('gs', 'Things'))
  })

  it('rewards camelCase humps', () => {
    expect(fuzzyMatch('ucp', 'useCommandPalette')?.indices).toEqual([0, 3, 10])
  })

  it('finds the optimal alignment, not the greedy one', () => {
    // Greedy would take the first "a" and "b" (indices 1, 4); the consecutive run "ab" scores better.
    expect(fuzzyMatch('ab', 'xa-xbxab')?.indices).toEqual([6, 7])
  })

  it('rejects weak, widely scattered matches', () => {
    expect(fuzzyMatch('go', 'Toggle dark mode')).toBeNull()
    expect(fuzzyMatch('go', 'Change accent color')).toBeNull()
    expect(fuzzyMatch('go', 'Go to Features')).not.toBeNull()
    // Single characters always match if present.
    expect(fuzzyMatch('z', 'Organize the bazaar')).not.toBeNull()
  })

  it('prefers consecutive matches', () => {
    expect(score('dark', 'Dark mode')).toBeGreaterThan(score('dark', 'Do a rank'))
  })
})

describe('matchFields', () => {
  it('requires every term to match, in any order', () => {
    const fields = { title: 'Toggle dark mode' }
    expect(matchFields('dark toggle', fields)).not.toBeNull()
    expect(matchFields('dark banana', fields)).toBeNull()
  })

  it('matches keywords and subtitle without highlighting them', () => {
    const fields = { title: 'Log out', subtitle: 'End your session', keywords: ['sign out', 'exit'] }
    const kw = matchFields('exit', fields)
    expect(kw).not.toBeNull()
    expect(kw?.titleIndices).toEqual([])
    expect(matchFields('session', fields)?.titleIndices).toEqual([])
  })

  it('weights title matches above keyword matches', () => {
    const titleHit = matchFields('billing', { title: 'Billing' })!.score
    const keywordHit = matchFields('billing', { title: 'Plans', keywords: ['billing'] })!.score
    expect(titleHit).toBeGreaterThan(keywordHit)
  })

  it('tokenizes on whitespace', () => {
    expect(tokenize('  open   new  tab ')).toEqual(['open', 'new', 'tab'])
  })
})

describe('highlight', () => {
  it('splits text into matched and unmatched segments', () => {
    expect(highlight('Settings', [0, 1, 2])).toEqual([
      { text: 'Set', match: true },
      { text: 'tings', match: false },
    ])
    expect(highlight('abc', [1])).toEqual([
      { text: 'a', match: false },
      { text: 'b', match: true },
      { text: 'c', match: false },
    ])
  })

  it('handles no matches and empty strings', () => {
    expect(highlight('abc', [])).toEqual([{ text: 'abc', match: false }])
    expect(highlight('', [0])).toEqual([])
  })
})

describe('rankItems / groupResults', () => {
  const items: CommandItem[] = [
    { id: 'a', title: 'Open project', group: 'Navigation' },
    { id: 'b', title: 'Projects overview', group: 'Navigation' },
    { id: 'c', title: 'Create project', group: 'Actions' },
    {
      id: 'theme',
      title: 'Change theme',
      group: 'Preferences',
      page: { title: 'Theme', items: [{ id: 'dark', title: 'Dark' }, { id: 'light', title: 'Light' }] },
    },
  ]

  it('keeps definition order for an empty query', () => {
    expect(rankItems(items, '').map((r) => r.item.id)).toEqual(['a', 'b', 'c', 'theme'])
  })

  it('sorts by score and drops non-matches', () => {
    const ids = rankItems(items, 'proj').map((r) => r.item.id)
    expect(ids[0]).toBe('b') // prefix match wins
    expect(ids).not.toContain('theme')
  })

  it('searches nested pages only when asked, with a breadcrumb path', () => {
    expect(rankItems(items, 'dark').map((r) => r.item.id)).toEqual([])
    const nested = rankItems(items, 'dark', { nested: true })
    expect(nested.map((r) => r.item.id)).toEqual(['dark'])
    expect(nested[0]!.path).toEqual(['Theme'])
  })

  it('respects the limit', () => {
    expect(rankItems(items, '', { limit: 2 })).toHaveLength(2)
  })

  it('groups by item.group, ordering sections by best score when searching', () => {
    const sections = groupResults(rankItems(items, 'create'), true)
    expect(sections[0]!.label).toBe('Actions')
    const all = groupResults(rankItems(items, ''), false)
    expect(all.map((s) => s.label)).toEqual(['Navigation', 'Actions', 'Preferences'])
  })
})
