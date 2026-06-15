# Harbor

（リポジトリ名: nageXym）

Symbol(XYM) で記事に投げ銭できる、ノンカストディアル・ウォレット内蔵のブログサイト。
秘密鍵・リカバリーフレーズ・ウォレットパスフレーズは**サーバーに送信・保存されず**、ブラウザ内で
Web Crypto API により暗号化して localStorage に保存されます（サーバーが保持するのは公開アドレスのみ）。

ログインは**メール/パスワードではなく、Symbol アドレス(DID)によるチャレンジ署名認証**です。
投げ銭・Thanks・有料記事の購入はすべて P2P（運営は送金を預からない）で、署名はクライアントで行います。

## 技術スタック

- Next.js 16（App Router / Turbopack）+ React 19 + TypeScript
- Tailwind CSS v4
- Auth.js v5（NextAuth）— **Symbol DID（チャレンジ署名）認証**（メール/パスワードは廃止）
- PostgreSQL + Prisma 7（driver adapter `@prisma/adapter-pg`）
- Tiptap v3（リッチテキストエディタ）
- symbol-sdk / symbol-hd-wallets（Symbol ウォレット・署名・送金・着金検証）
- Web Crypto API（PBKDF2 + AES-256-GCM、ローカル鍵暗号化）
- nodemailer（通報通知メール / SMTP 未設定時はログ出力）
- sharp（画像保存時のリサイズ・再エンコード圧縮）
- 画像: S3 互換オブジェクトストレージ（未設定時は `public/uploads/` にローカル保存）

## 主な機能

### 認証・プロフィール
- **Symbol DID 認証**: ワンタイム nonce のチャレンジをローカルウォレットで署名 → サーバーが公開鍵→アドレス導出・署名・nonce を検証してログイン（秘密鍵はサーバー非送信）
- 新規登録: ブラウザ内でウォレット新規作成 or 秘密鍵インポート（バックアップ確認必須）→ 自動ログイン
- プロフィール編集（アイコン / 表示名 / bio / X / Web サイト）と、特商法表記・販売条件の登録
- **SMD（social_meta_data）連携**: オンチェーンのメタデータからプロフィールを取得・適用
- ユーザーの**フォロー**機能

### 記事・コンテンツ
- 記事投稿（Tiptap・画像・タグ・下書き/公開・予約投稿・CRUD、保存時に HTML サニタイズ）
- **外部コンテンツ URL 共有投稿**（OGP 取得によるリンクカード、YouTube は oEmbed + サムネイル対応）
- 記事一覧 / 詳細 / 検索 / タグ絞り込み / **フォロー中フィード**（`/feed`）
- コメント、**リアクション**（👍❤️💡🔥🙏）
- **インプレッション（ビュー）カウント**、記事の**通報**（メール通知）

### Symbol / 送金まわり（すべて P2P・ノンカストディアル）
- ノンカストディアル・ウォレット（作成・バックアップ・暗号化保存・復元）
- **投げ銭**（スライダー 0.1〜10 XYM・署名・アナウンス・記録・着金ポーリングで確定）
- **Thanks / Super Thanks**（投稿者 → 読者への固定額の感謝送金）
- **有料記事・購読権販売**（試し読み + 有料部分、購入は販売者へ直接 P2P 送金しサーバーがオンチェーン検証）
- **収益管理ダッシュボード**（`/revenue`）: 販売・投げ銭の月次集計、取引時レートでの円換算、会計用 CSV エクスポート
- 複数ノードによる**フェイルオーバー**（ノード冗長化）

### デプロイ・セキュリティ
- セキュリティヘッダ / CSP（`next.config.ts`）、404 / エラーバウンダリ / メタデータ整備
- Vercel cron による着金ポーリングの定期実行

詳細な実装履歴は `docs/progress.md`、仕様は `docs/spec.md` を参照。

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
#   - NEXT_PUBLIC_SYMBOL_NODE_URL を設定（カンマ区切りで複数指定可）
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

> 初回ログインには Symbol（テストネット）ウォレットが必要です。`/register` でブラウザ内に新規作成するか、
> 既存の秘密鍵をインポートしてください。テスト用 XYM は Faucet（例: https://testnet.symbol.tools/）で入金できます。

### スクリプト

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` / `npm start` | 本番ビルド / 起動 |
| `npm run lint` | ESLint |
| `npm run typecheck` | 型チェック（tsc --noEmit） |
| `npm run db:push` | Prisma スキーマ反映 |
| `npm run db:generate` | Prisma クライアント生成 |
| `npm run db:migrate` | マイグレーション作成（本番運用向け） |

## 環境変数

`.env.example` を参照。主なもの:

- `DATABASE_URL` — PostgreSQL 接続文字列
- `AUTH_SECRET` — Auth.js セッション署名鍵
- `NEXT_PUBLIC_SITE_URL` — 本番サイト URL（OG/メタデータ用）
- `NEXT_PUBLIC_SYMBOL_NETWORK` — `testnet`（既定）/ `mainnet`
- `NEXT_PUBLIC_SYMBOL_NODE_URL` — Symbol ノードの REST URL。**カンマ区切りで複数指定**すると先頭から順にフェイルオーバー
- `CRON_SECRET` — 着金ポーリング cron の Bearer シークレット
- `REPORT_NOTIFY_EMAIL` / `SMTP_*` — 通報通知メール（SMTP 未設定時は実送信せずサーバーログに出力）
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

> 有料記事の購入（`nagexym:buy:<postId>`）・Thanks（`nagexym:thanks:<reactionId>`）も、サーバーが
> ノードでオンチェーン TX を検証してから記録します（クライアント申告だけでは解除・記録されません）。

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
6. 通報通知メールを使う場合は `REPORT_NOTIFY_EMAIL` と `SMTP_*` を設定してください。

## セキュリティ

- 秘密鍵・リカバリーフレーズ・パスフレーズはサーバーに送信/保存/ログ出力しません（サーバーが保持するのは公開アドレスのみ）。
- ログインは秘密鍵をローカルで使う**チャレンジ署名**で行い、署名・nonce・公開鍵→アドレス導出をサーバーで検証します。
- 投げ銭・Thanks・有料記事の購入はすべて**サーバーがオンチェーン TX を検証**してから記録（金額・送金先・送金元・マーカーを確認）。
- ローカル鍵暗号化は Web Crypto API（PBKDF2 + AES-256-GCM）のみ使用。
- Tiptap の出力は保存時に許可リスト方式でサニタイズ（XSS 対策）。外部 URL 取得（OGP）は SSRF 対策（http/https 限定・プライベートホスト拒否・サイズ/時間制限）。
- セキュリティヘッダ / CSP を `next.config.ts` で付与。
