/**
 * Public types for vue-command-palette.
 */

/** Context passed to `perform` handlers so commands can control the palette. */
export interface CommandContext {
  /** Current search query at the moment the command was selected. */
  query: string
  /** Close the palette. */
  close: () => void
  /** Navigate back one page (no-op on the root page). */
  back: () => void
  /** Push a nested page programmatically. */
  push: (page: CommandPage) => void
  /** Replace the search query. */
  setQuery: (query: string) => void
}

export interface CommandItem {
  /** Stable unique id. Used for keys, recent items and ARIA ids. */
  id: string
  /** Main label. Fuzzy-matched and highlighted. */
  title: string
  /** Secondary text shown under/next to the title. Also searchable (lower weight). */
  subtitle?: string
  /** Section heading the item is grouped under. */
  group?: string
  /** Extra search terms that are not displayed (synonyms, aliases). */
  keywords?: string[]
  /** Short text/emoji rendered as the leading icon. Use the `item` slot for SVG icons. */
  icon?: string
  /** Keys shown as hint chips on the right, e.g. `['G', 'H']`. Display only. */
  shortcut?: string[]
  /** Disabled items are rendered but skipped by keyboard navigation and cannot be selected. */
  disabled?: boolean
  /** Called when the item is selected. */
  perform?: (ctx: CommandContext) => void | Promise<void>
  /** Selecting the item opens this nested page instead of (or before) closing. */
  page?: CommandPage
  /** Overrides the palette-level `closeOnSelect` for this item. */
  closeOnSelect?: boolean
  /** Arbitrary payload, handy inside custom item slots. */
  data?: unknown
}

/** A nested page, e.g. "Theme →" with its own items and async sources. */
export interface CommandPage {
  /** Breadcrumb label. Defaults to the parent item's title. */
  title?: string
  /** Input placeholder while this page is active. */
  placeholder?: string
  items?: CommandItem[]
  sources?: CommandSource[]
}

/** An asynchronous result provider (API search, database lookup, …). */
export interface CommandSource {
  /** Unique id of the source. */
  id: string
  /** Section heading for this source's results. */
  group?: string
  /** Debounce delay in ms before `fetch` is called. Default: 200. */
  debounce?: number
  /** Minimum trimmed query length before `fetch` is called. Default: 1. Use 0 to fetch on an empty query. */
  minQueryLength?: number
  /**
   * Fetch results for `query`. The `signal` is aborted when a newer query supersedes this one,
   * so pass it to `fetch()` to cancel in-flight HTTP requests.
   * Stale responses are discarded even if you ignore the signal.
   */
  fetch: (query: string, signal: AbortSignal) => Promise<CommandItem[]>
  /**
   * When true (default), returned items are re-ranked by the local fuzzy matcher and
   * non-matching items are dropped. Set to false if the server already ranks results.
   */
  filter?: boolean
}

export interface RecentOptions {
  /** localStorage key. Default: `vcp:recent`. */
  storageKey?: string
  /** Maximum number of remembered items. Default: 5. */
  max?: number
  /** Section heading. Default: `Recent`. */
  label?: string
}

export type PaletteTheme = 'light' | 'dark' | 'auto'

/** A contiguous run of text, flagged when it is part of the fuzzy match. */
export interface HighlightSegment {
  text: string
  match: boolean
}

/** An item after matching, as rendered in the list. */
export interface ResultItem {
  /** Unique key inside the current result list. */
  key: string
  item: CommandItem
  score: number
  /** Indices of matched characters within `item.title`. */
  indices: number[]
  segments: HighlightSegment[]
  /** Breadcrumb for items found inside nested pages. */
  path: string[]
  /** Id of the async source that produced this item, if any. */
  sourceId?: string
}

export interface ResultSection {
  id: string
  label?: string
  items: ResultItem[]
}

export interface CommandPaletteProps {
  /** Static commands for the root page. Items may contain nested pages. */
  items?: CommandItem[]
  /** Async sources queried on the root page. */
  sources?: CommandSource[]
  /** Global hotkey that toggles the palette. `false` disables it. Default: `mod+k`. */
  hotkey?: string | false
  /** Input placeholder on the root page. */
  placeholder?: string
  /** Text shown when nothing matches. */
  emptyText?: string
  /** Text shown while async sources load and there are no results yet. */
  loadingText?: string
  /** Color scheme. `auto` follows `prefers-color-scheme`. Default: `auto`. */
  theme?: PaletteTheme
  /** Remember recently selected items. `false` disables. Default: `true`. */
  recent?: boolean | RecentOptions
  /** When the query is not empty, also search items inside nested pages. Default: `true`. */
  searchNested?: boolean
  /** Maximum static results per page. Default: 50. */
  limit?: number
  /** Teleport target, or `false` to render in place. Default: `body`. */
  teleport?: string | false
  /** Close the palette when an item with `perform` is selected. Items can override it. Default: `true`. */
  closeOnSelect?: boolean
  /** Prevent page scrolling while open. Default: `true`. */
  lockScroll?: boolean
  /** Accessible name of the dialog. Default: `Command palette`. */
  label?: string
}
