import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import CommandPalette from '../src/CommandPalette.vue'
import type { CommandItem, CommandPaletteProps, CommandSource } from '../src/types'

let wrapper: VueWrapper | undefined

function makeItems(): CommandItem[] {
  return [
    { id: 'home', title: 'Go to Dashboard', group: 'Navigation', perform: vi.fn() },
    { id: 'projects', title: 'Go to Projects', group: 'Navigation', perform: vi.fn() },
    { id: 'archived', title: 'Archived projects', group: 'Navigation', disabled: true },
    { id: 'new', title: 'Create project', group: 'Actions', keywords: ['add'], perform: vi.fn() },
    {
      id: 'theme',
      title: 'Change theme',
      group: 'Preferences',
      page: {
        title: 'Theme',
        placeholder: 'Pick a theme…',
        items: [
          { id: 'theme-dark', title: 'Dark', perform: vi.fn() },
          { id: 'theme-light', title: 'Light', perform: vi.fn() },
        ],
      },
    },
  ]
}

function mountPalette(props: Partial<CommandPaletteProps> & { open?: boolean } = {}, slots = {}): VueWrapper {
  const w = mount(CommandPalette, {
    attachTo: document.body,
    props: {
      open: true,
      teleport: false as const,
      items: makeItems(),
      'onUpdate:open': (value: boolean) => w.setProps({ open: value }),
      ...props,
    },
    slots,
  })
  wrapper = w
  return w
}

const input = (w: VueWrapper) => w.find<HTMLInputElement>('input.vcp-input')
const options = (w: VueWrapper) => w.findAll('[role="option"]')
const activeTitle = (w: VueWrapper) => w.find('[role="option"][aria-selected="true"] .vcp-item-title').text()
const press = (w: VueWrapper, key: string, init: KeyboardEventInit = {}) => input(w).trigger('keydown', { key, ...init })

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('CommandPalette rendering & ARIA', () => {
  it('renders a modal dialog with a combobox wired to a listbox', async () => {
    const w = mountPalette()
    await nextTick()
    const dialog = w.find('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    const combo = input(w)
    expect(combo.attributes('role')).toBe('combobox')
    const listbox = w.find('[role="listbox"]')
    expect(combo.attributes('aria-controls')).toBe(listbox.attributes('id'))
    const active = w.find('[role="option"][aria-selected="true"]')
    expect(combo.attributes('aria-activedescendant')).toBe(active.attributes('id'))
  })

  it('groups items under section headings', () => {
    const w = mountPalette()
    const headings = w.findAll('.vcp-group-heading').map((h) => h.text())
    expect(headings).toEqual(['Navigation', 'Actions', 'Preferences'])
    const group = w.find('[role="group"]')
    expect(w.find(`[id="${group.attributes('aria-labelledby')}"]`).text()).toBe('Navigation')
  })

  it('does not render when closed', () => {
    const w = mountPalette({ open: false })
    expect(w.find('[role="dialog"]').exists()).toBe(false)
  })

  it('focuses the input when opened', async () => {
    const w = mountPalette()
    await nextTick()
    expect(document.activeElement).toBe(input(w).element)
  })
})

describe('search', () => {
  it('filters with fuzzy matching and highlights matched characters', async () => {
    const w = mountPalette()
    await input(w).setValue('gtp')
    expect(options(w).map((o) => o.find('.vcp-item-title').text())).toEqual(['Go to Projects'])
    expect(w.findAll('mark.vcp-match').map((m) => m.text())).toEqual(['G', 't', 'P'])
  })

  it('matches keywords', async () => {
    const w = mountPalette()
    await input(w).setValue('add')
    expect(activeTitle(w)).toBe('Create project')
  })

  it('finds items inside nested pages and shows the breadcrumb as a group', async () => {
    const w = mountPalette()
    await input(w).setValue('dark')
    expect(activeTitle(w)).toBe('Dark')
    expect(w.find('.vcp-group-heading').text()).toBe('Theme')
  })

  it('shows the empty state', async () => {
    const w = mountPalette({ emptyText: 'Nothing here' })
    await input(w).setValue('zzzz')
    expect(options(w)).toHaveLength(0)
    expect(w.find('.vcp-empty').text()).toBe('Nothing here')
  })
})

describe('keyboard navigation', () => {
  it('moves with arrows, wraps around and skips disabled items', async () => {
    const w = mountPalette()
    expect(activeTitle(w)).toBe('Go to Dashboard')
    await press(w, 'ArrowDown')
    expect(activeTitle(w)).toBe('Go to Projects')
    await press(w, 'ArrowDown') // skips "Archived projects" (disabled)
    expect(activeTitle(w)).toBe('Create project')
    await press(w, 'ArrowDown')
    await press(w, 'ArrowDown') // wraps
    expect(activeTitle(w)).toBe('Go to Dashboard')
    await press(w, 'ArrowUp') // wraps backwards
    expect(activeTitle(w)).toBe('Change theme')
  })

  it('supports Home / End and Ctrl+N / Ctrl+P', async () => {
    const w = mountPalette()
    await press(w, 'End')
    expect(activeTitle(w)).toBe('Change theme')
    await press(w, 'Home')
    expect(activeTitle(w)).toBe('Go to Dashboard')
    await press(w, 'n', { ctrlKey: true })
    expect(activeTitle(w)).toBe('Go to Projects')
    await press(w, 'p', { ctrlKey: true })
    expect(activeTitle(w)).toBe('Go to Dashboard')
  })

  it('updates aria-activedescendant as the active option changes', async () => {
    const w = mountPalette()
    await press(w, 'ArrowDown')
    const active = w.find('[role="option"][aria-selected="true"]')
    expect(input(w).attributes('aria-activedescendant')).toBe(active.attributes('id'))
  })

  it('resets the active item to the first match when the query changes', async () => {
    const w = mountPalette()
    await press(w, 'End')
    expect(activeTitle(w)).toBe('Change theme')
    await input(w).setValue('go')
    expect(activeTitle(w)).toBe(options(w)[0]!.find('.vcp-item-title').text())
  })

  it('Enter runs perform with a context, emits select and closes', async () => {
    const items = makeItems()
    const w = mountPalette({ items })
    await press(w, 'ArrowDown')
    await press(w, 'Enter')
    await flushPromises()
    expect(items[1]!.perform).toHaveBeenCalledWith(expect.objectContaining({ close: expect.any(Function), query: '' }))
    expect(w.emitted('select')![0]).toEqual([items[1]])
    expect(w.emitted('update:open')!.at(-1)).toEqual([false])
  })

  it('keeps the palette open when closeOnSelect is false', async () => {
    const items = makeItems()
    items[0]!.closeOnSelect = false
    const w = mountPalette({ items })
    await press(w, 'Enter')
    expect(items[0]!.perform).toHaveBeenCalled()
    expect(w.emitted('update:open')).toBeUndefined()
  })

  it('clicking an option selects it; disabled options are inert', async () => {
    const items = makeItems()
    const w = mountPalette({ items })
    await options(w)[2]!.trigger('click') // disabled
    expect(w.emitted('select')).toBeUndefined()
    await options(w)[3]!.trigger('click')
    expect(items[3]!.perform).toHaveBeenCalled()
  })

  it('Escape closes the palette', async () => {
    const w = mountPalette()
    await press(w, 'Escape')
    expect(w.emitted('update:open')!.at(-1)).toEqual([false])
  })

  it('emits error when perform rejects', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('boom')
    const w = mountPalette({ items: [{ id: 'x', title: 'Explode', perform: () => Promise.reject(boom) }] })
    await press(w, 'Enter')
    await flushPromises()
    expect(w.emitted('error')![0]).toEqual([boom, expect.objectContaining({ id: 'x' })])
    expect(spy).toHaveBeenCalled()
  })
})

describe('nested pages', () => {
  it('opens a page, shows breadcrumbs, and goes back with Backspace or Escape', async () => {
    const w = mountPalette()
    await input(w).setValue('theme')
    await press(w, 'Enter')
    expect(input(w).element.value).toBe('')
    expect(input(w).attributes('placeholder')).toBe('Pick a theme…')
    expect(options(w).map((o) => o.text())).toEqual(['Dark', 'Light'])
    expect(w.find('.vcp-breadcrumbs').text()).toContain('Theme')

    await press(w, 'Backspace')
    expect(input(w).element.value).toBe('theme') // parent query restored
    expect(activeTitle(w)).toBe('Change theme')

    await press(w, 'Enter')
    await press(w, 'Escape') // back, not close
    expect(w.emitted('update:open')).toBeUndefined()
    expect(activeTitle(w)).toBe('Change theme')
  })

  it('performs nested commands', async () => {
    const items = makeItems()
    const w = mountPalette({ items })
    await press(w, 'End')
    await press(w, 'Enter')
    await press(w, 'Enter')
    expect(items[4]!.page!.items![0]!.perform).toHaveBeenCalled()
  })
})

describe('recent items', () => {
  it('remembers selected commands and lists them first on an empty query', async () => {
    const w = mountPalette()
    await input(w).setValue('create')
    await press(w, 'Enter')
    await w.setProps({ open: true })
    await nextTick()
    expect(w.find('.vcp-group-heading').text()).toBe('Recent')
    expect(activeTitle(w)).toBe('Create project')
    // Not duplicated below.
    expect(options(w).filter((o) => o.text().includes('Create project'))).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('vcp:recent')!)).toEqual(['new'])
  })

  it('can be disabled', async () => {
    const w = mountPalette({ recent: false })
    await press(w, 'Enter')
    await w.setProps({ open: true })
    expect(w.findAll('.vcp-group-heading').map((h) => h.text())).not.toContain('Recent')
  })
})

describe('global hotkey & focus management', () => {
  it('toggles with the hotkey (Ctrl+K on non-Apple platforms)', async () => {
    const w = mountPalette({ open: false })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    await nextTick()
    expect(w.emitted('update:open')!.at(-1)).toEqual([true])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    await nextTick()
    expect(w.emitted('update:open')!.at(-1)).toEqual([false])
  })

  it('ignores the hotkey when disabled', async () => {
    const w = mountPalette({ open: false, hotkey: false })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    await nextTick()
    expect(w.emitted('update:open')).toBeUndefined()
  })

  it('restores focus to the previously focused element on close', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const w = mountPalette({ open: false })
    await w.setProps({ open: true })
    await nextTick()
    expect(document.activeElement).toBe(input(w).element)
    await press(w, 'Escape')
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(trigger)
  })

  it('traps Tab inside the dialog', async () => {
    // Open a nested page so the dialog has several focusable elements (breadcrumbs + input).
    const w = mountPalette()
    await input(w).setValue('theme')
    await press(w, 'Enter')
    const crumbs = w.findAll('.vcp-crumb')
    const tab = (shiftKey = false) => {
      const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
      document.activeElement!.dispatchEvent(ev)
      return ev
    }
    // DOM order: [Home] [Theme] <input>. Tab from the input (last) wraps to the first breadcrumb…
    ;(input(w).element as HTMLElement).focus()
    expect(tab().defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(crumbs[0]!.element)
    // …and Shift+Tab from the first wraps back to the input.
    expect(tab(true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(input(w).element)
  })

  it('locks page scroll while open', async () => {
    const w = mountPalette({ open: false })
    await w.setProps({ open: true })
    expect(document.documentElement.style.overflow).toBe('hidden')
    await w.setProps({ open: false })
    expect(document.documentElement.style.overflow).toBe('')
  })
})

describe('async sources', () => {
  it('debounces, shows loading, renders results and ignores stale responses', async () => {
    vi.useFakeTimers()
    const pending: { query: string; resolve: (items: CommandItem[]) => void }[] = []
    const source: CommandSource = {
      id: 'users',
      group: 'People',
      debounce: 100,
      fetch: (query) => new Promise((resolve) => pending.push({ query, resolve })),
    }
    const w = mountPalette({ items: [], sources: [source] })

    await input(w).setValue('al')
    await vi.advanceTimersByTimeAsync(100)
    await input(w).setValue('ali')
    await vi.advanceTimersByTimeAsync(100)
    expect(pending.map((p) => p.query)).toEqual(['al', 'ali'])
    expect(w.find('.vcp-spinner').exists()).toBe(true)
    expect(w.find('.vcp-empty').text()).toBe('Searching…')

    pending[1]!.resolve([{ id: 'u1', title: 'Alice Martin' }])
    await flushPromises()
    pending[0]!.resolve([{ id: 'u2', title: 'Alan Turing' }, { id: 'u3', title: 'Alma Smith' }])
    await flushPromises()

    expect(w.find('.vcp-spinner').exists()).toBe(false)
    expect(w.find('.vcp-group-heading').text()).toBe('People')
    expect(options(w).map((o) => o.find('.vcp-item-title').text())).toEqual(['Alice Martin'])
    expect(w.findAll('mark').map((m) => m.text()).join('')).toBe('Ali')
  })
})

describe('slots', () => {
  it('renders a custom item slot with match segments', async () => {
    const w = mountPalette(
      {},
      {
        item: ({ item, active, segments }: { item: CommandItem; active: boolean; segments: { text: string; match: boolean }[] }) =>
          h('span', { class: ['custom', active && 'is-active'] }, `${item.id}:${segments.filter((s) => s.match).map((s) => s.text).join('')}`),
      },
    )
    await input(w).setValue('dash')
    expect(w.find('.custom.is-active').text()).toBe('home:Dash')
  })

  it('renders the empty slot with the query', async () => {
    const w = mountPalette({}, { empty: ({ query }: { query: string }) => h('p', `No match for “${query}”`) })
    await input(w).setValue('qqq')
    expect(w.find('.vcp-empty').text()).toBe('No match for “qqq”')
  })
})
