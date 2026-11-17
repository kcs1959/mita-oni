<script setup lang="ts">
import { useRoute } from 'vue-router'

// 「ホーム（家アイコン）」「遊び方」「ルーム一覧」の共通ヘッダ。/・/how-to・/rooms・/ranking で使う。
// 画面上端に固定した細いバーで、半透明+ぼかしで背景の星となじませる
const route = useRoute()
const links = [
  { to: '/how-to', label: '遊び方' },
  { to: '/rooms', label: 'ルーム一覧' },
  { to: '/ranking', label: 'ランキング' },
]
const isCurrent = (to: string) => route.path === to
</script>

<template>
  <nav class="page-nav" aria-label="ページナビゲーション">
    <div class="page-nav-inner">
      <RouterLink class="page-nav-link home" :class="{ on: isCurrent('/') }" :aria-current="isCurrent('/') ? 'page' : undefined" to="/" aria-label="ホーム">
        <svg class="home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M10 21v-6h4v6" />
        </svg>
      </RouterLink>
      <RouterLink
        v-for="l in links"
        :key="l.to"
        class="page-nav-link"
        :class="{ on: isCurrent(l.to) }"
        :aria-current="isCurrent(l.to) ? 'page' : undefined"
        :to="l.to"
      >
        {{ l.label }}
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.page-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  padding-top: env(safe-area-inset-top);
  background: color-mix(in srgb, var(--panel-deep) 88%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
/* 中身は .screen と同じ幅で中央に揃える */
.page-nav-inner { display: flex; width: min(100%, 438px); margin: 0 auto; padding: 0 24px; }
.page-nav-link { position: relative; flex: 1; display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 8px; color: var(--muted); font-size: 15px; font-weight: 700; text-decoration: none; white-space: nowrap; transition: color .2s; }
.page-nav-link:hover { color: var(--text); }
/* ホームは家のアイコン。テキストの項目より少し細くする */
.page-nav-link.home { flex: 0 0 60px; }
.home-icon { width: 22px; height: 22px; }
/* 現在のページは文字色+下線を滑らかにフェードインさせる */
.page-nav-link::after { content: ''; position: absolute; bottom: 0; left: 22%; right: 22%; height: 3px; border-radius: 3px 3px 0 0; background: var(--lime); opacity: 0; transform: scaleX(.55); transition: opacity .2s, transform .2s; }
.page-nav-link.on { color: var(--lime); }
.page-nav-link.on::after { opacity: 1; transform: scaleX(1); }
@media (max-width: 359px) { .page-nav-inner { padding: 0 18px; } .page-nav-link.home { flex-basis: 50px; } }
</style>
