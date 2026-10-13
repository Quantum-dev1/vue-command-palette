<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
import type {
  CommandContext,
  CommandItem,
  CommandPage,
  CommandPaletteProps,
  CommandSource,
  HighlightSegment,
  ResultItem,
  ResultSection,
} from './types'
import { AsyncSearch, type SourceState } from './core/async-search'
import { matchFields } from './core/fuzzy'
import { createRecentStore } from './core/recent'
import { findItemById, groupResults, rankItems, toResult } from './core/search'
import { trapTab } from './core/focus-trap'
import { useHotkey } from './composables/useHotkey'

defineOptions({ name: 'CommandPalette', inheritAttrs: false })

const props = withDefaults(defineProps<CommandPaletteProps>(), {
  items: () => [],
  sources: () => [],
  hotkey: 'mod+k',
  placeholder: 'Type a command or search…',
  emptyText: 'No results found.',
  loadingText: 'Searching…',
  theme: 'auto',
  recent: true,
  searchNested: true,
  limit: 50,
  teleport: 'body',
  closeOnSelect: true,
  lockScroll: true,
  label: 'Command palette',
})

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  /** An item was chosen (by Enter or click). */
  select: [item: CommandItem]
  /** An item's `perform` threw or rejected. */
  error: [error: unknown, item: CommandItem]
}>()

defineSlots<{
  /** Custom item rendering. */
  item?: (props: { item: CommandItem; result: ResultItem; active: boolean; segments: HighlightSegment[] }) => unknown
  /** Shown when there are no results. */
  empty?: (props: { query: string }) => unknown
  /** Footer content (replaces the default keyboard hints). */
  footer?: () => unknown
}>()

const EMPTY_SOURCES: CommandSource[] = []
const EMPTY_ITEMS: CommandItem[] = []

interface Frame {
  key: string
  title?: string
  placeholder?: string
  items: CommandItem[]
  sources: CommandSource[]
  /** Query on the parent page when this page was opened, restored on back. */
  parentQuery: string
}

const uid = useId()
const listId = `${uid}-listbox`
const optionId = (index: number): string => `${uid}-option-${index}`
const headingId = (section: ResultSection): string => `${uid}-group-${section.id.replace(/[^\w-]/g, '_')}`

const query = ref('')
const stack = shallowRef<Frame[]>([])
const activeKey = ref<string | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
let frameCounter = 0

const rootFrame = computed<Frame>(() => ({
  key: 'root',
  placeholder: props.placeholder,
  items: props.items,
  sources: props.sources,
  parentQuery: '',
}))
const page = computed<Frame>(() => stack.value.at(-1) ?? rootFrame.value)
const isRoot = computed(() => stack.value.length === 0)
const placeholderText = computed(() => page.value.placeholder ?? props.placeholder)

// ---------------------------------------------------------------- recent items
const recentOptions = computed(() => {
  if (props.recent === false) return null
  const custom = typeof props.recent === 'object' ? props.recent : {}
  return { storageKey: 'vcp:recent', max: 5, label: 'Recent', ...custom }
})
const recentStore = computed(() =>
  recentOptions.value ? createRecentStore(recentOptions.value.storageKey, recentOptions.value.max) : null,
)
const recentIds = ref<string[]>([])
const refreshRecent = (): void => {
  recentIds.value = recentStore.value?.get() ?? []
}

// ---------------------------------------------------------------- async sources
const asyncStates = shallowRef<ReadonlyMap<string, SourceState>>(new Map())
const asyncSearch = new AsyncSearch((states) => {
  asyncStates.value = new Map(states)
})
const loading = computed(() => [...asyncStates.value.values()].some((s) => s.loading))

watch(
  [() => page.value.sources, query, open],
  () => {
    if (!open.value) {
      asyncSearch.reset()
      return
    }
    asyncSearch.run(page.value.sources, query.value)
  },
  { immediate: true },
)
onBeforeUnmount(() => asyncSearch.dispose())

// ---------------------------------------------------------------- results
const sections = computed<ResultSection[]>(() => {
  const q = query.value
  const hasQuery = q.trim().length > 0
  const frame = page.value
  const out: ResultSection[] = []

  let staticResults = rankItems(frame.items, q, {
    nested: props.searchNested && hasQuery,
    limit: props.limit,
  })

  if (!hasQuery && isRoot.value && recentOptions.value) {
    const recentItems = recentIds.value
      .map((id) => findItemById(props.items, id))
      .filter((item): item is CommandItem => !!item && !item.disabled)
    if (recentItems.length) {
      out.push({
        id: '__recent__',
        label: recentOptions.value.label,
        items: recentItems.map((item) => toResult(item, 0, [], [], 'r')),
      })
      const ids = new Set(recentItems.map((i) => i.id))
      staticResults = staticResults.filter((r) => !ids.has(r.item.id))
    }
  }

  out.push(...groupResults(staticResults, hasQuery))

  for (const source of frame.sources) {
    const state = asyncStates.value.get(source.id)
    if (!state?.items.length) continue
    const keyPrefix = `a:${source.id}`
    const results =
      source.filter === false
        ? state.items.map((item) => toResult(item, 0, matchFields(q, item)?.titleIndices ?? [], [], keyPrefix, source.id))
        : rankItems(state.items, q, { keyPrefix, sourceId: source.id })
    if (results.length) out.push({ id: `__source__${source.id}`, label: source.group, items: results })
  }
  return out
})

const flat = computed(() => sections.value.flatMap((s) => s.items))
const indexByKey = computed(() => new Map(flat.value.map((r, i) => [r.key, i])))

const firstEnabled = (list: ResultItem[]): number => list.findIndex((r) => !r.item.disabled)

const activeIndex = computed(() => {
  const list = flat.value
  const i = activeKey.value ? (indexByKey.value.get(activeKey.value) ?? -1) : -1
  if (i >= 0 && !list[i]!.item.disabled) return i
  return firstEnabled(list)
})
const activeResult = computed(() => flat.value[activeIndex.value])
const activeDescendant = computed(() => (activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined))

const announcement = computed(() => {
  if (!open.value) return ''
  if (loading.value && !flat.value.length) return props.loadingText
  const n = flat.value.length
  return n === 0 ? props.emptyText : `${n} result${n === 1 ? '' : 's'} available.`
})

watch([query, page], () => {
  activeKey.value = null
})

watch(
  activeIndex,
  (index) => {
    if (index < 0) return
    const el = listRef.value?.querySelector<HTMLElement>(`[data-index="${index}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  },
  { flush: 'post' },
)

// ---------------------------------------------------------------- navigation
function move(delta: 1 | -1): void {
  const list = flat.value
  if (!list.length) return
  let i = activeIndex.value
  for (let step = 0; step < list.length; step++) {
    i = (i + delta + list.length) % list.length
    if (!list[i]!.item.disabled) {
      activeKey.value = list[i]!.key
      return
    }
  }
}

function moveToEdge(edge: 'first' | 'last'): void {
  const list = flat.value
  const ordered = edge === 'first' ? list : [...list].reverse()
  const target = ordered.find((r) => !r.item.disabled)
  if (target) activeKey.value = target.key
}

function setActive(result: ResultItem): void {
  if (!result.item.disabled && activeKey.value !== result.key) activeKey.value = result.key
}

function focusInput(): void {
  void nextTick(() => inputRef.value?.focus())
}

function pushPage(target: CommandPage, fallbackTitle?: string): void {
  stack.value = [
    ...stack.value,
    {
      key: `page-${++frameCounter}`,
      title: target.title ?? fallbackTitle,
      placeholder: target.placeholder,
      items: target.items ?? EMPTY_ITEMS,
      sources: target.sources ?? EMPTY_SOURCES,
      parentQuery: query.value,
    },
  ]
  query.value = ''
  focusInput()
}

function back(): void {
  if (isRoot.value) return
  const top = stack.value.at(-1)!
  stack.value = stack.value.slice(0, -1)
  query.value = top.parentQuery
  focusInput()
}

function goTo(depth: number): void {
  while (stack.value.length > depth) back()
}

function close(): void {
  open.value = false
}

function toggle(): void {
  open.value = !open.value
}

function setQuery(value: string): void {
  query.value = value
}

function context(): CommandContext {
  return { query: query.value, close, back, push: (p) => pushPage(p), setQuery }
}

async function select(result: ResultItem | undefined): Promise<void> {
  if (!result || result.item.disabled) return
  const { item } = result
  emit('select', item)

  if (item.page) {
    pushPage(item.page, item.title)
    return
  }

  if (recentStore.value && !result.sourceId && findItemById(props.items, item.id)) {
    recentStore.value.push(item.id)
  }

  const ctx = context()
  if (item.closeOnSelect ?? props.closeOnSelect) close()
  try {
    await item.perform?.(ctx)
  } catch (error) {
    emit('error', error, item)
    console.error('[vue-command-palette] command failed:', item.id, error)
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return
  const ctrlOnly = event.ctrlKey && !event.metaKey && !event.altKey
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      move(-1)
      break
    case 'n':
    case 'p':
      // Emacs-style Ctrl+N / Ctrl+P.
      if (ctrlOnly) {
        event.preventDefault()
        move(event.key === 'n' ? 1 : -1)
      }
      break
    case 'Home':
      event.preventDefault()
      moveToEdge('first')
      break
    case 'End':
      event.preventDefault()
      moveToEdge('last')
      break
    case 'Enter':
      if (event.target !== inputRef.value) return
      event.preventDefault()
      void select(activeResult.value)
      break
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      if (isRoot.value) close()
      else back()
      break
    case 'Backspace':
      if (!query.value && !isRoot.value && event.target === inputRef.value) {
        event.preventDefault()
        back()
      }
      break
    case 'Tab':
      trapTab(event, dialogRef.value)
      break
  }
}

// ---------------------------------------------------------------- open / close lifecycle
let previouslyFocused: HTMLElement | null = null
let previousOverflow: string | null = null

function lockScroll(): void {
  if (!props.lockScroll || typeof document === 'undefined' || previousOverflow !== null) return
  previousOverflow = document.documentElement.style.overflow
  document.documentElement.style.overflow = 'hidden'
}

function unlockScroll(): void {
  if (previousOverflow === null) return
  document.documentElement.style.overflow = previousOverflow
  previousOverflow = null
}

watch(
  open,
  (isOpen, wasOpen) => {
    if (typeof document === 'undefined') return
    if (isOpen) {
      const active = document.activeElement
      previouslyFocused = active instanceof HTMLElement && active !== document.body ? active : null
      query.value = ''
      stack.value = []
      activeKey.value = null
      refreshRecent()
      lockScroll()
      focusInput()
    } else if (wasOpen) {
      unlockScroll()
      const target = previouslyFocused
      previouslyFocused = null
      if (target?.isConnected) void nextTick(() => target.focus())
    }
  },
  { immediate: true },
)

onBeforeUnmount(unlockScroll)

useHotkey(
  () => props.hotkey,
  () => toggle(),
)

defineExpose({
  /** Open the palette. */
  open: () => {
    open.value = true
  },
  close,
  toggle,
  back,
  push: (target: CommandPage) => pushPage(target),
  setQuery,
})
</script>

<template>
  <Teleport :to="teleport || 'body'" :disabled="teleport === false">
    <Transition name="vcp">
      <div v-if="open" class="vcp-root" :data-vcp-theme="theme" v-bind="$attrs">
        <div class="vcp-overlay" aria-hidden="true" @click="close" />
        <div ref="dialogRef" class="vcp-dialog" role="dialog" aria-modal="true" :aria-label="label" @keydown="onKeydown">
          <nav v-if="!isRoot" class="vcp-breadcrumbs" aria-label="Command pages">
            <button type="button" class="vcp-crumb" @click="goTo(0)">Home</button>
            <template v-for="(frame, depth) in stack" :key="frame.key">
              <span class="vcp-crumb-sep" aria-hidden="true">›</span>
              <button
                type="button"
                class="vcp-crumb"
                :aria-current="depth === stack.length - 1 ? 'page' : undefined"
                @click="goTo(depth + 1)"
              >
                {{ frame.title }}
              </button>
            </template>
          </nav>

          <div class="vcp-search">
            <svg class="vcp-search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4.5 4.5"
              />
            </svg>
            <input
              ref="inputRef"
              v-model="query"
              class="vcp-input"
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              :aria-controls="listId"
              :aria-activedescendant="activeDescendant"
              :aria-label="label"
              :placeholder="placeholderText"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
            <span v-if="loading" class="vcp-spinner" aria-hidden="true" />
            <kbd class="vcp-kbd vcp-esc" aria-hidden="true">esc</kbd>
          </div>

          <div
            :id="listId"
            ref="listRef"
            class="vcp-list"
            :class="{ 'vcp-list--empty': !flat.length }"
            role="listbox"
            :aria-label="`${label} results`"
          >
            <div
              v-for="section in sections"
              :key="section.id"
              class="vcp-group"
              role="group"
              :aria-labelledby="section.label ? headingId(section) : undefined"
            >
              <div v-if="section.label" :id="headingId(section)" class="vcp-group-heading" aria-hidden="true">
                {{ section.label }}
              </div>
              <div
                v-for="result in section.items"
                :id="optionId(indexByKey.get(result.key)!)"
                :key="result.key"
                class="vcp-item"
                :class="{
                  'vcp-item--active': indexByKey.get(result.key) === activeIndex,
                  'vcp-item--disabled': result.item.disabled,
                }"
                role="option"
                :aria-selected="indexByKey.get(result.key) === activeIndex"
                :aria-disabled="result.item.disabled || undefined"
                :data-index="indexByKey.get(result.key)"
                @mousemove="setActive(result)"
                @mousedown.prevent
                @click="select(result)"
              >
                <slot
                  name="item"
                  :item="result.item"
                  :result="result"
                  :active="indexByKey.get(result.key) === activeIndex"
                  :segments="result.segments"
                >
                  <span v-if="result.item.icon" class="vcp-item-icon" aria-hidden="true">{{ result.item.icon }}</span>
                  <span class="vcp-item-text">
                    <span class="vcp-item-title">
                      <template v-for="(seg, i) in result.segments" :key="i">
                        <mark v-if="seg.match" class="vcp-match">{{ seg.text }}</mark>
                        <template v-else>{{ seg.text }}</template>
                      </template>
                    </span>
                    <span v-if="result.item.subtitle" class="vcp-item-subtitle">{{ result.item.subtitle }}</span>
                  </span>
                  <span v-if="result.item.shortcut?.length" class="vcp-item-shortcut" aria-hidden="true">
                    <kbd v-for="key in result.item.shortcut" :key="key" class="vcp-kbd">{{ key }}</kbd>
                  </span>
                  <span v-if="result.item.page" class="vcp-item-chevron" aria-hidden="true">›</span>
                </slot>
              </div>
            </div>
          </div>

          <div v-if="!flat.length" class="vcp-empty">
            <template v-if="loading">{{ loadingText }}</template>
            <slot v-else name="empty" :query="query">{{ emptyText }}</slot>
          </div>

          <footer class="vcp-footer">
            <slot name="footer">
              <span class="vcp-hint"><kbd class="vcp-kbd">↑</kbd><kbd class="vcp-kbd">↓</kbd> navigate</span>
              <span class="vcp-hint"><kbd class="vcp-kbd">↵</kbd> select</span>
              <span v-if="!isRoot" class="vcp-hint"><kbd class="vcp-kbd">⌫</kbd> back</span>
              <span class="vcp-hint"><kbd class="vcp-kbd">esc</kbd> {{ isRoot ? 'close' : 'back' }}</span>
            </slot>
          </footer>

          <div class="vcp-sr-only" role="status" aria-live="polite">{{ announcement }}</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
