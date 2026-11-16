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

ローカルDBにマイグレーションを適用する。

```sh
cd backend
npx wrangler d1 migrations apply DB --local
```

## サーバーの起動

```sh
cd backend
npm run dev    # Worker + Durable Object + D1 (http://localhost:8787)

cd ../frontend
npm run dev   # Vite (http://localhost:5173 または 5174)
```

ブラウザで、localhostのURLを開く。
