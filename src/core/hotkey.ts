/**
 * Minimal hotkey parsing. Combos look like `mod+k`, `ctrl+shift+p`, `alt+/`.
 * `mod` means ⌘ on Apple platforms and Ctrl elsewhere.
 */

export interface ParsedHotkey {
  key: string
  meta: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
}

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform ?? nav.platform ?? ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

export function parseHotkey(combo: string, apple = isApplePlatform()): ParsedHotkey {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
  // Support "mod++" style combos where the key itself is "+".
  const key = parts.at(-1) === '' ? '+' : (parts.at(-1) ?? '')
  const mods = new Set(parts.slice(0, -1))
  return {
    key,
    meta: mods.has('meta') || mods.has('cmd') || (mods.has('mod') && apple),
    ctrl: mods.has('ctrl') || mods.has('control') || (mods.has('mod') && !apple),
    alt: mods.has('alt') || mods.has('option'),
    shift: mods.has('shift'),
  }
}

export function matchesHotkey(event: KeyboardEvent, combo: string | ParsedHotkey, apple = isApplePlatform()): boolean {
  const hk = typeof combo === 'string' ? parseHotkey(combo, apple) : combo
  const key = event.key?.toLowerCase()
  // When the produced character is not a Latin letter (non-Latin layouts, Alt/Option-modified keys),
  // fall back to the physical key code. Latin layouts such as Dvorak keep matching by character.
  const codeKey =
    !/^[a-z]$/.test(key ?? '') && event.code?.startsWith('Key') ? event.code.slice(3).toLowerCase() : undefined
  return (
    (key === hk.key || codeKey === hk.key) &&
    event.metaKey === hk.meta &&
    event.ctrlKey === hk.ctrl &&
    event.altKey === hk.alt &&
    event.shiftKey === hk.shift
  )
}

/** Human-readable label, e.g. `⌘K` on macOS and `Ctrl K` elsewhere. */
export function formatHotkey(combo: string, apple = isApplePlatform()): string {
  const hk = parseHotkey(combo, apple)
  const key = hk.key.length === 1 ? hk.key.toUpperCase() : hk.key.charAt(0).toUpperCase() + hk.key.slice(1)
  if (apple) {
    return `${hk.ctrl ? '⌃' : ''}${hk.alt ? '⌥' : ''}${hk.shift ? '⇧' : ''}${hk.meta ? '⌘' : ''}${key}`
  }
  const mods = [hk.ctrl && 'Ctrl', hk.alt && 'Alt', hk.shift && 'Shift', hk.meta && 'Meta'].filter(Boolean)
  return [...mods, key].join(' ')
}
