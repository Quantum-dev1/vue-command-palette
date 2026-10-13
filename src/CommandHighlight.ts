import { defineComponent, h, type PropType } from 'vue'
import type { HighlightSegment } from './types'

/**
 * Renders highlight segments with `<mark class="vcp-match">` around matched runs.
 * Handy inside a custom `#item` slot: `<CommandHighlight :segments="segments" />`.
 */
export const CommandHighlight = defineComponent({
  name: 'CommandHighlight',
  props: {
    segments: { type: Array as PropType<HighlightSegment[]>, required: true },
  },
  setup(props) {
    return () =>
      h(
        'span',
        { class: 'vcp-highlight' },
        props.segments.map((seg) => (seg.match ? h('mark', { class: 'vcp-match' }, seg.text) : seg.text)),
      )
  },
})
