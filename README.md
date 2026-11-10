# mita-oni

## 必要なもの

- Node.js 22 以上
- Rust（[rustup](https://rustup.rs/) で導入）と wasm ターゲット

```sh
rustup target add wasm32-unknown-unknown
```

## セットアップ

```sh
npm --prefix frontend install
npm --prefix backend install

# ローカル D1 にテーブルを作成
npm --prefix backend run db:migrate:local

# Worker が配信する静的ファイルを用意（wrangler dev の起動に必要）
npm --prefix frontend run build
```

## ローカル起動

ターミナルを 2 つ使う。

```sh
npm --prefix backend run dev    # Worker + Durable Object + D1 (http://localhost:8787)
npm --prefix frontend run dev   # Vite (http://localhost:5173) ← ブラウザでこちらを開く
```

## デプロイ

```sh
cd backend
npx wrangler d1 create mita-oni   # 出力された database_id を wrangler.toml に設定
npm run db:migrate:remote
npm run deploy
```
