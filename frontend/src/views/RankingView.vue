<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchRanking } from '../lib/api'
import { mmssCs } from '../lib/format'
import type { RankingResponse, Role } from '../lib/protocol'
import { getName } from '../lib/session'

const route = useRoute()
const router = useRouter()

// 自分の記録（直前のゲーム結果）。URL の ?role=&me= で受け取る
const myRole = route.query.role === 'oni' ? 'oni' : route.query.role === 'runner' ? 'runner' : null
const myId = Number(route.query.me) || undefined

const tab = ref<Role>(myRole ?? 'oni')
const data = ref<RankingResponse | null>(null)
const error = ref(false)

// 自分の記録があるのは自分の役割のタブだけ
const meForTab = computed(() => (tab.value === myRole ? myId : undefined))

async function load(offset?: number) {
  error.value = false
  try {
    data.value = await fetchRanking(tab.value, { me: meForTab.value, offset })
  } catch {
    error.value = true
  }
}

watch(tab, () => load(), { immediate: true })

const pageLabel = computed(() => {
  const d = data.value
  if (!d) return ''
  if (d.myRank !== null) return `${d.myRank}位 / ${d.total}人`
  if (d.entries.length === 0) return `0人`
  return `${d.offset + 1}〜${d.offset + d.entries.length}位 / ${d.total}人`
})
const hasPrev = computed(() => (data.value?.offset ?? 0) > 0)
const hasNext = computed(() => !!data.value && data.value.offset + data.value.limit < data.value.total)

function prev() {
  if (data.value) load(Math.max(0, data.value.offset - data.value.limit))
}

function next() {
  if (data.value) load(data.value.offset + data.value.limit)
}

function replay() {
  router.push(getName() ? '/play' : '/')
}
</script>

<template>
  <main class="screen">
    <span class="step">08 / LEADERBOARD</span>
    <div class="wrap">
      <h1>殿堂入りランキング</h1>
      <p class="muted desc">速い鬼と逃げ上手は誰だ？</p>

      <div class="tabs">
        <button class="chip tab" :class="{ on: tab === 'oni' }" @click="tab = 'oni'">プロ鬼</button>
        <button class="chip tab" :class="{ on: tab === 'runner' }" @click="tab = 'runner'">プロ逃げ</button>
      </div>

      <div class="panel info">
        <div class="metric">順位はプレイ時間が短い順</div>
        <div v-if="tab === 'oni'" class="muted hint">is鬼 = true / プロ鬼</div>
      </div>

      <p v-if="error" class="muted">ランキングを読み込めませんでした。</p>
      <ol v-else-if="data" class="rows">
        <li v-if="data.entries.length === 0" class="muted empty">まだ記録がありません</li>
        <li v-for="(e, i) in data.entries" :key="e.id" class="row" :class="{ me: e.id === meForTab }">
          <span v-if="e.id === meForTab" class="here">あなたはここ！</span>
          <span class="rank">{{ data.offset + i + 1 }}</span>
          <span class="name">{{ e.name }}</span>
          <span class="time">{{ mmssCs(e.playTimeMs) }}</span>
        </li>
      </ol>

      <div v-if="data" class="pager muted">
        <button class="link" :disabled="!hasPrev" @click="prev">‹ 前の7人</button>
        <span>{{ pageLabel }}</span>
        <button class="link" :disabled="!hasNext" @click="next">次の7人 ›</button>
      </div>

      <div class="actions">
        <button class="btn btn-panel" @click="router.push('/rooms')">ルーム一覧を見る</button>
        <button class="btn btn-primary" @click="replay">もう1度あそぶ ↻</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.wrap {
  width: min(720px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

h1 {
  margin: 16px 0 0;
  font-size: 36px;
}

.desc {
  margin: 0;
}

.tabs {
  display: flex;
  gap: 12px;
}

.tab {
  color: var(--text);
  padding: 10px 20px;
}

.tab.on {
  background: var(--lime);
  color: var(--bg);
}

.info {
  padding: 16px 20px;
  border-radius: 15px;
}

.metric {
  font-weight: 700;
}

.hint {
  font-size: 13px;
  margin-top: 4px;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  position: relative;
  display: grid;
  grid-template-columns: 56px 1fr auto;
  align-items: center;
  height: 52px;
  padding: 0 20px;
  border-radius: 11px;
  background: var(--panel);
  font-weight: 700;
}

.row.me {
  background: var(--lime);
  color: var(--bg);
  margin-top: 14px;
}

.rank {
  color: var(--muted);
}

.time {
  color: var(--muted);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.row.me .rank,
.row.me .time {
  color: var(--bg);
}

.here {
  position: absolute;
  top: -15px;
  left: 30%;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--yellow);
  color: var(--bg);
  font-size: 12px;
}

.empty {
  padding: 24px;
  text-align: center;
}

.pager {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
  font-size: 14px;
}

.link {
  background: none;
  color: var(--muted);
  font-weight: 700;
}

.link:disabled {
  opacity: 0.3;
  cursor: default;
}

.actions {
  display: flex;
  gap: 16px;
  padding: 16px;
  border-radius: 23px;
  background: var(--panel-deep);
}

.actions .btn {
  height: 52px;
}
</style>
