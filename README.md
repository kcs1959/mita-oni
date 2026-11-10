# mita-oni

## 初回セットアップ

- Node.js 22 以上
- Wrangler CLI（npm で入る）

```sh
npm --prefix frontend install
npm --prefix backend install

npm --prefix frontend run build
```

## DBのマイグレーション

```sh
npm --prefix backend run db:migrate:local
```

## サーバーの起動

```sh
npm --prefix backend run dev    # Worker + Durable Object + D1 (http://localhost:8787)
npm --prefix frontend run dev   # Vite (http://localhost:5173 または 5174)
```

ブラウザで、localhostのURLを開く。

## デプロイ

```sh
cd backend
npx wrangler d1 create mita-oni   # 出力された database_id を wrangler.toml に設定
npm run db:migrate:remote
npm run deploy
```
