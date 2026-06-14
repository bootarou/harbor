# Harbor

（リポジトリ名: nageXym）

Symbol(XYM) で記事に投げ銭できる、ノンカストディアル・ウォレット内蔵のブログサイト。
秘密鍵・リカバリーフレーズ・ウォレットパスフレーズは**サーバーに送信・保存されず**、ブラウザ内で
Web Crypto API により暗号化して localStorage に保存されます（サーバーが保持するのは公開アドレスのみ）。

## 技術スタック

- Next.js 16（App Router / Turbopack）+ TypeScript
- Tailwind CSS v4
- Auth.js v5（NextAuth）— メール + パスワード認証
- PostgreSQL + Prisma 7（driver adapter `@prisma/adapter-pg`）
- Tiptap v3（リッチテキストエディタ）
- symbol-sdk / symbol-hd-wallets（Symbol ウォレット・送金）
- Web Crypto API（PBKDF2 + AES-256-GCM、ローカル鍵暗号化）
- 画像: S3 互換オブジェクトストレージ（未設定時は `public/uploads/` にローカル保存）

## 機能（フェーズ）

1. 認証（登録/ログイン）
2. プロフィール編集（アイコン/表示名/bio/X）
3. 記事投稿（Tiptap・画像・下書き/公開・CRUD、保存時 HTML サニタイズ）
4. 記事一覧/詳細/コメント
5. ウォレット作成・バックアップ・暗号化保存・復元
6. 投げ銭送金（スライダー 0.1〜10 XYM・署名・アナウンス・記録・インジケータ・履歴）
7. 着金ポーリング（オンチェーン確定で記事へ紐付け）
8. UI/UX・デプロイ設定

詳細な進捗は `docs/progress.md`、仕様は `spec.md` を参照。

## 必要環境

- Node.js **20 以上**（推奨 22 LTS）
- PostgreSQL 14+
- （任意）Docker

## セットアップ

```bash
# 1. 依存インストール
npm install

# 2. 環境変数
cp .env.example .env
#   - DATABASE_URL を設定
#   - AUTH_SECRET を設定（`npx auth secret` または `openssl rand -base64 32`）
#   - CRON_SECRET を設定（任意の乱数）

# 3. DB（Docker を使う場合の例）
docker run -d --name nagexym-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=nagexym \
  -p 5432:5432 postgres:16

# 4. スキーマ反映 + クライアント生成
npm run db:push

# 5. 開発サーバー
npm run dev   # http://localhost:3000
```

### スクリプト

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` / `npm start` | 本番ビルド / 起動 |
| `npm run lint` | ESLint |
| `npm run typecheck` | 型チェック（tsc --noEmit） |
| `npm run db:push` | Prisma スキーマ反映 |
| `npm run db:migrate` | マイグレーション作成（本番運用向け） |

## 環境変数

`.env.example` を参照。主なもの:

- `DATABASE_URL` — PostgreSQL 接続文字列
- `AUTH_SECRET` — Auth.js セッション署名鍵
- `NEXT_PUBLIC_SITE_URL` — 本番サイト URL（OG/メタデータ用）
- `NEXT_PUBLIC_SYMBOL_NETWORK` — `testnet`（既定）/ `mainnet`
- `NEXT_PUBLIC_SYMBOL_NODE_URL` — Symbol ノードの REST URL
- `CRON_SECRET` — 着金ポーリング cron の Bearer シークレット
- `S3_*` / `NEXT_PUBLIC_S3_PUBLIC_URL` — 画像ストレージ（未設定ならローカル保存）

## Symbol ネットワーク

- 開発・テストは**常にテストネット**を使用します。
- テスト用 XYM は Faucet（例: https://testnet.symbol.tools/）でウォレットアドレスに入金。
- **メインネット対応は明示的な指示があるまで行いません。**

## 投げ銭の着金確定（ポーリング）

- 送金はクライアントで署名・アナウンスし、控えを `/api/tips` に記録（「確認中」）。
- ノードを定期ポーリングして著者アドレス宛の確定 TX をメッセージマーカー `nagexym:tip:<postId>` で
  記事に紐付け、「確定」にします。
- 実行方法:
  - 手動: `/tips` の「着金を同期」ボタン（ログインユーザー自身の着金）
  - cron: `GET /api/cron/poll-tips`（`Authorization: Bearer $CRON_SECRET`）

## デプロイ（Vercel 例）

1. リポジトリを Vercel にインポート。
2. 環境変数（上記）を設定。`NEXT_PUBLIC_SITE_URL` は本番 URL に。
3. Managed PostgreSQL（Vercel Postgres / Neon / Supabase 等）を用意し `DATABASE_URL` を設定。
   初回に `npx prisma migrate deploy`（または `db push`）を実行。
4. `vercel.json` の `crons` により `/api/cron/poll-tips` が定期実行されます。
   Vercel は cron リクエストに `Authorization: Bearer $CRON_SECRET` を自動付与するため、
   `CRON_SECRET` を環境変数に設定してください。
   （cron の最小実行間隔はプランに依存します）
5. 画像を永続化するため、本番では S3 互換ストレージ（`S3_*`）を設定してください
   （ローカルフォールバックはサーバーレス環境では永続化されません）。

## セキュリティ

- 秘密鍵・リカバリーフレーズ・パスフレーズはサーバーに送信/保存/ログ出力しません。
- ローカル鍵暗号化は Web Crypto API（PBKDF2 + AES-256-GCM）のみ使用。
- Tiptap の出力は保存時に許可リスト方式でサニタイズ（XSS 対策）。
- セキュリティヘッダ / CSP を `next.config.ts` で付与。
