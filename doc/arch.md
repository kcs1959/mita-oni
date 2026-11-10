# アーキテクチャ

```
ブラウザ (Vue 3 + Phaser 4)                Cloudflare Worker (TypeScript)
┌───────────────────────────┐            ┌──────────────────────────────────────────┐
│ /        名前入力          │  静的配信   │ [assets] frontend/dist (SPA)              │
│ /play    マッチング〜結果   │◀──────────│                                          │
│ /ranking ランキング         │            │ fetch ハンドラ (src/index.ts)             │
│ /rooms   ルーム監視         │  HTTP      │  GET /api/ranking ──────────▶ D1 (players) │
│                           │──────────▶│  WS  /api/ws/play  ─┐                     │
│ Phaser: 盤面描画 60fps     │  WebSocket │  WS  /api/ws/rooms ─┤                     │
│ Vue:    HUD・画面遷移       │◀─────────▶│                     ▼                     │
└───────────────────────────┘            │  Durable Object "RoomDO" × 50（各ルーム）    │
                                         │  Durable Object "LobbyDO" (1 インスタンス)   │
                                         │   ├ マッチング候補・ルーム監視の集約           │
                                         │   ├ 30Hz ゲームループ（対戦中のみ稼働）       │
                                         │   └ 決着時に D1 へ記録 ─────────▶ D1        │
                                         └──────────────────────────────────────────┘
```

## 構成

| 場所 | 役割 |
| --- | --- |
| `frontend/` | Vite + Vue 3 + TypeScript。`src/game/` が Phaser 4 の描画、`src/views/` が各画面 |
| `backend/` | TypeScript on Workers。`src/index.ts` (fetch ハンドラ)、`src/lobby.ts` (LobbyDO)、`src/room.ts` (RoomDO)、`src/ranking.ts` (API)、`src/db.ts` (D1) |
| `backend/migrations/` | D1 のスキーマ |

本番・ローカルとも 1 つの Worker がフロントの静的ファイルと `/api/*` を同一オリジンで配信する。
ローカル開発では Vite が `/api` を `wrangler dev` (:8787) へプロキシする。

## サーバー権威

- 移動・当たり判定・残り時間はすべてサーバー (RoomDO) が決める。クライアントは入力を送り、受け取った位置を描画するだけ。
- サーバーは 33ms ごと（約 30Hz）に全ルームを更新し、対戦中の各プレイヤーへ `state` を送る。
- クライアントは Phaser で 60fps 描画し、30Hz の位置更新の間を補間する。

## ゲームの流れ

1. `/play` が `WS /api/ws/play?name=` に接続 → Lobby が待機中 → 空室の順で候補を返し、RoomDO が 409 以外を返したらそこへ入る（`matching`）。50 室とも埋まっていれば `full`。
2. 2 人そろうと役割（鬼/逃げ）をランダムに決めて `ready`（3 秒カウントダウン）→ `start`。
3. 鬼と逃げが同じマスに入る（またはすれ違う）と `end: caught`、180 秒経過で `end: timeUp`。
4. 2 人分の記録（名前, プレイ時間, is鬼）を D1 に保存し、各自に `saved {recordId}` を送って切断。
5. `/ranking?role=&me=recordId` で自分が中央に来るページを表示。

メッセージの型は `backend/src/protocol.ts` と `frontend/src/lib/protocol.ts` に定義。

## D1

`players(id, name, play_time_ms, is_oni)`。ランキングは `is_oni` ごとに `(play_time_ms, id)` 昇順。

## DO の分担

- **RoomDO**: 1 ルーム 1 インスタンス（"room-1" 〜 "room-50"）。ゲームループは対戦中のみ setInterval で回す。
- **LobbyDO**: 1 インスタンス "main"。全ルームの状況を集約し、マッチング候補と /rooms 監視画面に配信する。状態は Durable Storage に保存し、ハイバネーションから復元できる。
- RoomDO は状態変化のたびに Lobby に報告する。Lobby は対戦中のルームがある間だけ 1 秒ごとに /rooms へ再送する（残り時間の更新用）。
