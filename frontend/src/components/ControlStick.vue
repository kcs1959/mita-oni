<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Dir } from '../lib/protocol'

const props = defineProps<{
  getCharacters: () => { x: number; y: number; radius: number }[]
}>()
const emit = defineEmits<{ direction: [dir: Dir | null] }>()

const stick = ref<HTMLDivElement>()
const offset = ref({ x: 0, y: 0 })
const opacity = ref(1)
const active = ref(false)
let pointerId: number | null = null
let origin = { x: 0, y: 0 }
let direction: Dir | null = null
let frame = 0

function setDirection(next: Dir | null) {
  if (direction === next) return
  direction = next
  emit('direction', next)
}

function start(event: PointerEvent) {
  if (pointerId !== null || event.button !== 0) return
  pointerId = event.pointerId
  origin = { x: event.clientX, y: event.clientY }
  active.value = true
  stick.value?.setPointerCapture(event.pointerId)
}

function drag(event: PointerEvent) {
  if (event.pointerId !== pointerId) return
  const dx = event.clientX - origin.x
  const dy = event.clientY - origin.y
  const distance = Math.hypot(dx, dy)
  const travel = (stick.value!.clientWidth - 50) / 2 - 6
  const scale = distance > travel ? travel / distance : 1
  offset.value = { x: dx * scale, y: dy * scale }
  // 中央付近の指の揺れでは動かさず、迷路に合わせて上下左右の4方向にする。
  setDirection(distance < 10 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
}

function stop(event?: PointerEvent) {
  if (event && event.pointerId !== pointerId) return
  const captured = pointerId
  pointerId = null
  active.value = false
  offset.value = { x: 0, y: 0 }
  setDirection(null)
  if (captured !== null && stick.value?.hasPointerCapture(captured)) stick.value.releasePointerCapture(captured)
}

function onVisibilityChange() {
  if (document.hidden) stop()
}

function onBlur() {
  stop()
}

function updateOpacity() {
  if (stick.value) {
    const bounds = stick.value.getBoundingClientRect()
    const centerX = bounds.left + bounds.width / 2
    const centerY = bounds.top + bounds.height / 2
    let visibility = 1
    for (const character of props.getCharacters()) {
      const distance = Math.hypot(character.x - centerX, character.y - centerY)
      const clearRadius = bounds.width / 2 + character.radius + 12
      visibility = Math.min(visibility, Math.max(0, Math.min(1, (distance - clearRadius) / 48)))
    }
    // 当たり領域はそのまま残し、描画だけを薄くする。背後のキャラクターをぼかさない。
    opacity.value = Math.round((0.12 + 0.88 * visibility) * 1000) / 1000
  }
  frame = requestAnimationFrame(updateOpacity)
}

onMounted(() => {
  frame = requestAnimationFrame(updateOpacity)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  stop()
  window.removeEventListener('blur', onBlur)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div
    ref="stick"
    class="control-stick"
    :class="{ active }"
    :style="{ opacity }"
    role="group"
    aria-label="移動スティック。動きたい方向へスワイプし、指を離すと停止します"
    @pointerdown.stop.prevent="start"
    @pointermove.stop.prevent="drag"
    @pointerup.stop.prevent="stop"
    @pointercancel.stop="stop"
    @lostpointercapture="stop"
    @contextmenu.prevent
  >
    <span class="stick-axis horizontal" aria-hidden="true" />
    <span class="stick-axis vertical" aria-hidden="true" />
    <span class="stick-thumb" :style="{ transform: `translate(${offset.x}px, ${offset.y}px)` }" aria-hidden="true"><span /></span>
  </div>
</template>

<style scoped>
.control-stick { position: absolute; left: 16px; bottom: 16px; z-index: 2; width: clamp(112px, 32vw, 132px); aspect-ratio: 1; display: grid; place-items: center; border-radius: 50%; border: 1px solid rgb(234 245 255 / 38%); background: rgb(16 23 40 / 18%); box-shadow: inset 0 0 0 8px rgb(234 245 255 / 4%); touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; transition: opacity 120ms linear; }
.stick-axis { position: absolute; background: rgb(234 245 255 / 16%); pointer-events: none; }
.horizontal { width: 64%; height: 1px; }.vertical { width: 1px; height: 64%; }
.stick-thumb { width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center; border: 1px solid rgb(234 245 255 / 60%); background: rgb(120 232 240 / 24%); box-shadow: 0 2px 8px rgb(9 19 34 / 22%); pointer-events: none; }
.stick-thumb > span { width: 8px; height: 8px; border-radius: 50%; background: var(--text); opacity: .8; }
.active .stick-thumb { border-color: var(--cyan); background: rgb(120 232 240 / 36%); }
@media (prefers-reduced-motion: reduce) { .control-stick { transition: none; } }
</style>
