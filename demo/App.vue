<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  CommandHighlight,
  CommandPalette,
  formatHotkey,
  isApplePlatform,
  useHotkey,
  type CommandItem,
  type CommandSource,
} from '../src'
import { searchPeople } from './fake-api'

type ThemeChoice = 'light' | 'dark' | 'system'

const INSTALL = 'npm i @quantumdev/vue-command-palette'
const REPO = 'https://github.com/Quantum-dev1/vue-command-palette'

const ACCENTS = [
  { id: 'blue', name: 'Blue', value: '#3b82f6', icon: '🔵' },
  { id: 'violet', name: 'Violet', value: '#8b5cf6', icon: '🟣' },
  { id: 'emerald', name: 'Emerald', value: '#10b981', icon: '🟢' },
  { id: 'amber', name: 'Amber', value: '#f59e0b', icon: '🟠' },
  { id: 'rose', name: 'Rose', value: '#f43f5e', icon: '🔴' },
] as const

function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const open = ref(false)
const themeChoice = ref<ThemeChoice>((readParam('theme') ?? readStored('demo:theme') ?? 'system') as ThemeChoice)
const accentId = ref(readParam('accent') ?? readStored('demo:accent') ?? 'blue')
const systemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => (systemDark.value = e.matches))

const resolvedTheme = computed<'light' | 'dark'>(() =>
  themeChoice.value === 'system' ? (systemDark.value ? 'dark' : 'light') : themeChoice.value,
)
const accent = computed(() => ACCENTS.find((a) => a.id === accentId.value)?.value ?? ACCENTS[0].value)

watch(
  [resolvedTheme, accent],
  () => {
    document.documentElement.dataset.theme = resolvedTheme.value
    document.documentElement.style.setProperty('--accent', accent.value)
  },
  { immediate: true },
)
watch(themeChoice, (v) => {
  try {
    localStorage.setItem('demo:theme', v)
  } catch {
    /* ignore */
  }
})
watch(accentId, (v) => {
  try {
    localStorage.setItem('demo:accent', v)
  } catch {
    /* ignore */
  }
})

const apple = isApplePlatform()
const hotkeyLabel = formatHotkey('mod+k')
const themeHotkey = 'alt+t'
const themeShortcut = apple ? ['⌥', 'T'] : ['Alt', 'T']

// ---- toasts
const toastText = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function toast(text: string): void {
  toastText.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastText.value = ''), 2200)
}

function scrollTo(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function copyInstall(): Promise<void> {
  try {
    await navigator.clipboard.writeText(INSTALL)
    toast('Install command copied to clipboard')
  } catch {
    toast(INSTALL)
  }
}

function toggleTheme(): void {
  themeChoice.value = resolvedTheme.value === 'dark' ? 'light' : 'dark'
  toast(`Switched to ${themeChoice.value} theme`)
}

useHotkey(themeHotkey, toggleTheme)

const peopleSource: CommandSource = {
  id: 'people',
  group: 'People · simulated API',
  debounce: 150,
  minQueryLength: 2,
  fetch: async (query, signal) =>
    (await searchPeople(query, signal)).map((person) => ({
      ...person,
      perform: () => toast(`Opening ${person.title}'s profile…`),
    })),
}

const items = computed<CommandItem[]>(() => [
  { id: 'nav-features', title: 'Go to Features', group: 'Navigation', icon: '✨', perform: () => scrollTo('features') },
  { id: 'nav-install', title: 'Go to Installation', group: 'Navigation', icon: '📦', perform: () => scrollTo('install') },
  { id: 'nav-api', title: 'Go to API reference', group: 'Navigation', icon: '📘', keywords: ['docs', 'props'], perform: () => scrollTo('api') },
  {
    id: 'open-repo',
    title: 'Open GitHub repository',
    subtitle: 'Source code, issues and releases',
    group: 'Navigation',
    icon: '🐙',
    keywords: ['source', 'code'],
    perform: () => {
      window.open(REPO, '_blank', 'noopener')
    },
  },
  {
    id: 'copy-install',
    title: 'Copy install command',
    subtitle: INSTALL,
    group: 'Actions',
    icon: '📋',
    keywords: ['npm', 'clipboard'],
    perform: copyInstall,
  },
  {
    id: 'toggle-theme',
    title: 'Toggle dark mode',
    group: 'Actions',
    icon: '🌓',
    shortcut: themeShortcut,
    keywords: ['light', 'appearance'],
    perform: toggleTheme,
  },
  {
    id: 'find-person',
    title: 'Find a teammate…',
    subtitle: 'Async search with debounce and stale-response protection',
    group: 'Actions',
    icon: '👥',
    page: { title: 'People', placeholder: 'Type a name or role…', sources: [{ ...peopleSource, minQueryLength: 1 }] },
  },
  {
    id: 'delete-workspace',
    title: 'Delete workspace',
    subtitle: 'Requires the owner role',
    group: 'Actions',
    icon: '🗑️',
    disabled: true,
  },
  {
    id: 'theme',
    title: 'Change theme…',
    group: 'Preferences',
    icon: '🎨',
    keywords: ['appearance', 'dark', 'light'],
    page: {
      title: 'Theme',
      placeholder: 'Choose a theme…',
      items: (['light', 'dark', 'system'] as const).map((t) => ({
        id: `theme-${t}`,
        title: t === 'system' ? 'System' : t === 'dark' ? 'Dark' : 'Light',
        icon: t === 'system' ? '💻' : t === 'dark' ? '🌙' : '☀️',
        subtitle: themeChoice.value === t ? 'Current' : undefined,
        perform: () => {
          themeChoice.value = t
          toast(`Theme: ${t}`)
        },
      })),
    },
  },
  {
    id: 'accent',
    title: 'Change accent color…',
    group: 'Preferences',
    icon: '🖌️',
    keywords: ['color', 'brand'],
    page: {
      title: 'Accent color',
      placeholder: 'Pick an accent…',
      items: ACCENTS.map((a) => ({
        id: `accent-${a.id}`,
        title: a.name,
        icon: a.icon,
        subtitle: accentId.value === a.id ? 'Current' : a.value,
        closeOnSelect: false,
        perform: () => {
          accentId.value = a.id
        },
      })),
    },
  },
])

const isPerson = (item: CommandItem): boolean => (item.data as { kind?: string } | undefined)?.kind === 'person'
const initials = (item: CommandItem): string => (item.data as { initials?: string }).initials ?? '?'

const features = [
  { icon: '⚡', title: 'Fuzzy search', text: 'Optimal-alignment scoring with word-boundary and camelCase bonuses, plus match highlighting.' },
  { icon: '🌐', title: 'Async sources', text: 'Debounced, abortable fetches. Stale responses can never overwrite newer results.' },
  { icon: '🗂️', title: 'Nested pages', text: '“Theme →”-style sub-menus with breadcrumbs, Backspace to go back, deep search across pages.' },
  { icon: '♿', title: 'Accessible', text: 'ARIA combobox + listbox, focus trap, focus restore, live result announcements.' },
  { icon: '🎨', title: 'Themeable', text: 'Light, dark or auto. Every color, radius and size is a CSS variable.' },
  { icon: '🪶', title: 'Tiny & typed', text: 'Zero runtime dependencies besides Vue. ~8 kB gzipped JS. Written in TypeScript.' },
]

// Split closing tag so the SFC parser does not end this <script> block early.
const SCRIPT_END = '</' + 'script>'
const usage = `<script setup lang="ts">
import { ref } from 'vue'
import { CommandPalette, type CommandItem } from '@quantumdev/vue-command-palette'
import '@quantumdev/vue-command-palette/style.css'

const open = ref(false)
const items: CommandItem[] = [
  { id: 'home', title: 'Go to Dashboard', group: 'Navigation', perform: () => router.push('/') },
  { id: 'new', title: 'Create project', group: 'Actions', shortcut: ['N'], perform: createProject },
]
${SCRIPT_END}

<template>
  <CommandPalette v-model:open="open" :items="items" />
</template>`

onMounted(() => {
  if (readParam('open') === '1') open.value = true
})
</script>

<template>
  <div class="page">
    <div class="glow" aria-hidden="true" />
    <header class="topbar">
      <a class="brand" href="#" aria-label="Vue Command Palette home">
        <span class="logo" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="28" height="28">
            <rect width="32" height="32" rx="8" fill="var(--accent)" />
            <path d="M10 12l5 4-5 4M17 21h6" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        vue-command-palette
      </a>
      <nav class="links">
        <a href="#features" @click.prevent="scrollTo('features')">Features</a>
        <a href="#install" @click.prevent="scrollTo('install')">Install</a>
        <a href="#api" @click.prevent="scrollTo('api')">API</a>
        <a :href="REPO" target="_blank" rel="noopener">GitHub</a>
      </nav>
      <button class="search-trigger" type="button" @click="open = true">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4.5 4.5" />
        </svg>
        <span>Search…</span>
        <kbd>{{ hotkeyLabel }}</kbd>
      </button>
    </header>

    <main>
      <section class="hero">
        <p class="eyebrow">Vue 3 · TypeScript · zero dependencies</p>
        <h1>The <span class="accent">⌘K</span> menu your Vue app deserves.</h1>
        <p class="lead">
          A fast, accessible command palette with fuzzy search, async sources, nested pages and recent items — drop it in
          and let power users fly.
        </p>
        <div class="cta">
          <button class="primary" type="button" @click="open = true">
            Try it — press <kbd>{{ hotkeyLabel }}</kbd>
          </button>
          <button class="install" type="button" title="Copy install command" @click="copyInstall">
            <code>$ {{ INSTALL }}</code>
          </button>
        </div>
      </section>

      <section id="features" class="features">
        <article v-for="f in features" :key="f.title" class="card">
          <div class="card-icon" aria-hidden="true">{{ f.icon }}</div>
          <h3>{{ f.title }}</h3>
          <p>{{ f.text }}</p>
        </article>
      </section>

      <section id="install" class="code-section">
        <h2>Install</h2>
        <pre><code>{{ INSTALL }}</code></pre>
        <pre><code>{{ usage }}</code></pre>
      </section>

      <section id="api" class="code-section">
        <h2>Try these</h2>
        <ul class="tips">
          <li>Type <kbd>gti</kbd> — fuzzy match for “Go to Installation”.</li>
          <li>Type <kbd>dark</kbd> — finds items inside the nested “Theme” page.</li>
          <li>Open “Find a teammate…” and type fast — results come from a simulated API with random latency.</li>
          <li><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Home</kbd> <kbd>End</kbd> to move, <kbd>↵</kbd> to run, <kbd>⌫</kbd> on an empty query to go back.</li>
        </ul>
      </section>
    </main>

    <footer class="footer">
      Built by <a href="https://quantumdevteam.com" target="_blank" rel="noopener">Quantum Dev</a> · MIT License
    </footer>

    <Transition name="toast">
      <div v-if="toastText" class="toast" role="status">{{ toastText }}</div>
    </Transition>

    <CommandPalette
      v-model:open="open"
      :items="items"
      :sources="[peopleSource]"
      :theme="resolvedTheme"
      :style="{ '--vcp-accent': accent, '--vcp-match': accent }"
      placeholder="Search commands, pages and people…"
    >
      <template #item="{ item, segments, active }">
        <span v-if="isPerson(item)" class="avatar" :class="{ active }" aria-hidden="true">{{ initials(item) }}</span>
        <span v-else-if="item.icon" class="vcp-item-icon" aria-hidden="true">{{ item.icon }}</span>
        <span class="vcp-item-text">
          <span class="vcp-item-title"><CommandHighlight :segments="segments" /></span>
          <span v-if="item.subtitle" class="vcp-item-subtitle">{{ item.subtitle }}</span>
        </span>
        <span v-if="item.shortcut" class="vcp-item-shortcut" aria-hidden="true">
          <kbd v-for="k in item.shortcut" :key="k" class="vcp-kbd">{{ k }}</kbd>
        </span>
        <span v-if="item.page" class="vcp-item-chevron" aria-hidden="true">›</span>
      </template>
    </CommandPalette>
  </div>
</template>
