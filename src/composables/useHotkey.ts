import { onBeforeUnmount, onMounted, toValue, type MaybeRefOrGetter } from 'vue'
import { matchesHotkey } from '../core/hotkey'

/**
 * Register a global keydown listener for `combo` (e.g. `mod+k`) while the calling component is mounted.
 * Pass `false` (or a getter returning `false`) to disable it.
 */
export function useHotkey(combo: MaybeRefOrGetter<string | false>, handler: (event: KeyboardEvent) => void): void {
  const onKeydown = (event: KeyboardEvent): void => {
    const value = toValue(combo)
    if (!value || event.repeat || event.isComposing) return
    if (matchesHotkey(event, value)) {
      event.preventDefault()
      handler(event)
    }
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
