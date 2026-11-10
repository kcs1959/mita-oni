import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Phaser 単体で 1MB 超あるため警告の閾値を上げる（プレイ画面でのみ遅延読み込み）
  build: { chunkSizeWarningLimit: 1600 },
  server: {
    port: 5173,
    // ローカル開発時は API / WebSocket を wrangler dev（:8787）へ中継する
    proxy: {
      '/api': { target: 'http://localhost:8787', ws: true },
    },
  },
})
