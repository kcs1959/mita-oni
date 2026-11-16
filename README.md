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

## キャラクターの操作

- スマートフォン・タブレット：盤面左下のスティックを動きたい方向へスワイプし、倒している間は上下左右に連続移動します。指を離すと停止します。
- スティックは半透明で、自分や視界内の相手が近づくとさらに薄くなります。薄くなっている間も操作できます。
- パソコン：WASDキーまたはアローキーで移動します。長押しで連続移動します。画面上の矢印ボタンは1回押すごとに1マス移動します。
- 操作表示は端末の主なポインターがタッチ操作かどうかで切り替わります。スマートフォンの横向き表示にも対応しています。
- スティック中央付近の小さな指の揺れでは移動しません。画面が非表示になったときや対戦終了時には連続移動を停止します。
