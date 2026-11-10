<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { wsUrl } from '../lib/api'
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

let ws: WebSocket | null = null
let reconnectTimer: number | undefined
let alive = true

const shown = computed(() => (filter.value === 'all' ? rooms.value : rooms.value.filter((r) => r.status === filter.value)))

const statusLabel: Record<RoomStatus, string> = { playing: '対戦中', waiting: '待機中', empty: '空室' }

function pair(r: RoomView) {
  return `${r.players[0] ?? '—'}  vs  ${r.players[1] ?? '—'}`
}

function state(r: RoomView) {
  return `${statusLabel[r.status]}  •  ${r.status === 'playing' && r.remainingMs !== null ? mmss(r.remainingMs) : '—'}`
}

// サーバーが状態変化時と 1 秒ごとに一覧を push してくる。切れたら少し待って再接続する
function connect() {
  ws = new WebSocket(wsUrl('/api/ws/rooms'))
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data) as ServerMsg
    if (msg.type !== 'rooms') return
    rooms.value = msg.rooms
    playing.value = msg.playing
    waiting.value = msg.waiting
    total.value = msg.total
  }
  ws.onclose = () => {
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
  <main class="screen">
    <span class="step">09 / ROOM MONITOR</span>
    <div class="head">
      <div>
        <h1>ルーム状況</h1>
        <p class="muted">参加者と対戦状況をリアルタイム表示</p>
      </div>
      <div class="panel metrics">
        <div class="metric">
          <span class="v lime">{{ String(playing).padStart(2, '0') }}</span>
          <span class="muted">プレイ中</span>
        </div>
        <span class="divider" />
        <div class="metric">
          <span class="v cyan">{{ String(waiting).padStart(2, '0') }}</span>
          <span class="muted">待機中</span>
        </div>
        <span class="count">/ {{ total }}</span>
      </div>
    </div>

    <div class="filters">
      <button class="chip f" :class="{ on: filter === 'all' }" @click="filter = 'all'">すべて</button>
      <button class="chip f" :class="{ on: filter === 'playing' }" @click="filter = 'playing'">プレイ中</button>
      <button class="chip f" :class="{ on: filter === 'waiting' }" @click="filter = 'waiting'">待機中</button>
    </div>

    <ul class="grid">
      <li v-for="r in shown" :key="r.id" class="card" :class="r.status">
        <span class="id">#{{ roomNo(r.id) }}</span>
        <div>
          <div class="pair">{{ pair(r) }}</div>
          <div class="muted state">{{ state(r) }}</div>
        </div>
      </li>
    </ul>

    <footer class="foot">
      <span class="muted">最大{{ total }}ルーム / {{ total * 2 }}人</span>
      <button class="btn btn-primary" @click="router.push('/')">ゲームに戻る →</button>
    </footer>
  </main>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 32px;
  margin: 16px 0 24px;
}

h1 {
  margin: 0;
  font-size: 40px;
}

.head p {
  margin: 8px 0 0;
}

.metrics {
  display: flex;
  align-items: center;
  gap: 40px;
  padding: 20px 40px;
  border-radius: 20px;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 13px;
}

.v {
  font-size: 40px;
  font-weight: 700;
  line-height: 1.1;
}

.lime {
  color: var(--lime);
}

.cyan {
  color: var(--cyan);
}

.divider {
  width: 1px;
  height: 56px;
  background: rgb(157 175 197 / 30%);
}

.count {
  font-size: 24px;
  font-weight: 700;
}

.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.f {
  color: var(--text);
  min-width: 110px;
  justify-content: center;
}

.f.on {
  background: var(--lime);
  color: var(--bg);
}

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
}

.card {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 16px;
  align-items: center;
  padding: 12px;
  border-radius: 14px;
  background: var(--panel);
}

.card.empty {
  opacity: 0.6;
}

.id {
  display: grid;
  place-items: center;
  height: 42px;
  border-radius: 10px;
  background: var(--panel-deep);
  font-weight: 700;
}

.pair {
  font-weight: 700;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

.state {
  font-size: 13px;
  margin-top: 2px;
  white-space: pre;
}

.foot {
  margin-top: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.foot .btn {
  height: 54px;
}
</style>
