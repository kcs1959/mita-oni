<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { wsUrl } from '../lib/api'
import PageNav from '../components/PageNav.vue'
import { mmss, roomNo } from '../lib/format'
import type { RoomStatus, RoomView, ServerMsg } from '../lib/protocol'

type Filter = 'all' | 'playing' | 'waiting'

const RECONNECT_MS = 2000

const router = useRouter()
const rooms = ref<RoomView[]>([])
const playing = ref(0)
const waiting = ref(0)
const total = ref(50)
const filter = ref<Filter>('all')
const connected = ref(false)
const received = ref(false)

let ws: WebSocket | null = null
let reconnectTimer: number | undefined
let alive = true

const shown = computed(() => (filter.value === 'all' ? rooms.value : rooms.value.filter((r) => r.status === filter.value)))

const statusLabel: Record<RoomStatus, string> = { playing: '対戦中', waiting: '待機中', empty: '空室' }

function pair(r: RoomView) {
  if (r.status === 'empty') return '参加者なし'
  if (r.players.length < 2) return `${r.players[0] ?? '—'} ・ 1/2人`
  return `${r.players[0]} vs ${r.players[1]}`
}

// サーバーが状態変化時と 1 秒ごとに一覧を push してくる。切れたら少し待って再接続する
function connect() {
  ws = new WebSocket(wsUrl('/api/ws/rooms'))
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data) as ServerMsg
    if (msg.type !== 'rooms') return
    connected.value = true
    received.value = true
    rooms.value = msg.rooms
    playing.value = msg.playing
    waiting.value = msg.waiting
    total.value = msg.total
  }
  ws.onclose = () => {
    connected.value = false
    if (alive) reconnectTimer = window.setTimeout(connect, RECONNECT_MS)
  }
}

onMounted(connect)
onBeforeUnmount(() => {
  alive = false
  clearTimeout(reconnectTimer)
  ws?.close()
})
</script>

<template>
  <main class="screen rooms">
    <PageNav />
    <header>
      <span class="step">ライブ状況</span>
      <h1>ルーム一覧</h1>
      <p class="page-description">最大{{ total }}ルーム ・ 2人対戦</p>
    </header>
    <div class="panel metrics" aria-label="ルーム稼働状況">
      <div><strong class="cyan">{{ String(playing).padStart(2, '0') }}</strong><span>対戦中</span></div>
      <div><strong class="lime">{{ String(waiting).padStart(2, '0') }}</strong><span>待機中</span></div>
      <div><strong>{{ total }}</strong><span>最大</span></div>
    </div>
    <div class="segments" role="group" aria-label="ルームの絞り込み">
      <button class="segment" :class="{ on: filter === 'all' }" :aria-pressed="filter === 'all'" @click="filter = 'all'">すべて</button>
      <button class="segment" :class="{ on: filter === 'playing' }" :aria-pressed="filter === 'playing'" @click="filter = 'playing'">対戦中</button>
      <button class="segment" :class="{ on: filter === 'waiting' }" :aria-pressed="filter === 'waiting'" @click="filter = 'waiting'">待機中</button>
    </div>
    <p v-if="!connected" class="connection muted" role="status">{{ received ? '接続を確認しています。自動で再接続します。' : 'ルーム状況に接続しています…' }}</p>
    <ul class="inset-list room-list" aria-label="ルーム一覧">
      <li v-if="received && shown.length === 0" class="empty-state">{{ filter === 'all' ? 'ルームはありません' : filter === 'playing' ? '対戦中のルームはありません' : '待機中のルームはありません' }}</li>
      <li v-for="r in shown" :key="r.id" class="room-row" :class="r.status">
        <span class="id">#{{ roomNo(r.id) }}</span>
        <div class="room-details"><div class="pair">{{ pair(r) }}</div><div class="state">{{ statusLabel[r.status] }}</div></div>
        <span v-if="r.status === 'playing' && r.remainingMs !== null" class="time">{{ mmss(r.remainingMs) }}</span>
      </li>
    </ul>
    <footer class="bottom-actions"><button class="btn btn-secondary" @click="router.push('/')">ホームに戻る</button></footer>
  </main>
</template>

<style scoped>
.page-description { margin-bottom: 14px; }
.metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 10px 20px 16px; border-radius: 17px; margin-bottom: 15px; }
.metrics > div { display: flex; flex-direction: column; gap: 6px; }
.metrics > div:not(:first-child) { align-items: center; }
.metrics strong { font-size: 29px; line-height: 42px; font-weight: 900; font-variant-numeric: tabular-nums; }
.metrics span { color: var(--muted); font-size: 14px; }
.cyan { color: var(--cyan); }
.lime { color: var(--lime); }
.room-list { margin-top: 15px; max-height: 48svh; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.room-row { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; align-items: center; gap: 9px; min-height: 69px; border-bottom: 1px solid var(--edge); }
.room-row:last-child { border: 0; }
.id, .time { font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums; }
.id { color: var(--muted); }
.room-details { min-width: 0; }
.pair { font-size: 16px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.state { font-size: 13px; margin-top: 4px; color: var(--muted); }
.playing .state { color: var(--cyan); }
.waiting .state { color: var(--lime); }
.connection { font-size: 13px; margin: 12px 0 0; }
</style>
