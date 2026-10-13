import { describe, expect, it } from 'vitest'
import { formatHotkey, matchesHotkey, parseHotkey } from '../src/core/hotkey'

const key = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', init)

describe('hotkeys', () => {
  it('maps mod to meta on Apple and ctrl elsewhere', () => {
    expect(parseHotkey('mod+k', true)).toMatchObject({ key: 'k', meta: true, ctrl: false })
    expect(parseHotkey('mod+k', false)).toMatchObject({ key: 'k', meta: false, ctrl: true })
  })

  it('matches exact modifier sets only', () => {
    expect(matchesHotkey(key({ key: 'k', metaKey: true }), 'mod+k', true)).toBe(true)
    expect(matchesHotkey(key({ key: 'k', ctrlKey: true }), 'mod+k', false)).toBe(true)
    expect(matchesHotkey(key({ key: 'k', ctrlKey: true, shiftKey: true }), 'mod+k', false)).toBe(false)
    expect(matchesHotkey(key({ key: 'k' }), 'mod+k', false)).toBe(false)
    expect(matchesHotkey(key({ key: 'P', ctrlKey: true, shiftKey: true }), 'ctrl+shift+p', false)).toBe(true)
  })

  it('falls back to the physical key for non-Latin layouts', () => {
    expect(matchesHotkey(key({ key: 'κ', code: 'KeyK', ctrlKey: true }), 'mod+k', false)).toBe(true)
    // A Latin character that differs from the combo must not match via the physical code.
    expect(matchesHotkey(key({ key: 't', code: 'KeyK', ctrlKey: true }), 'mod+k', false)).toBe(false)
  })

  it('formats labels per platform', () => {
    expect(formatHotkey('mod+k', true)).toBe('⌘K')
    expect(formatHotkey('mod+k', false)).toBe('Ctrl K')
    expect(formatHotkey('ctrl+shift+p', true)).toBe('⌃⇧P')
  })
})
