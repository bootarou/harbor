# 開発進捗 (progress.md)

仕様書: `/spec.md` / 指針: `/CLAUDE.md`

---

## 追加機能: 記事の通報（メール通知）✅ (2026-06-14)
- リアクション欄（「この記事はどうでしたか？」）に**控えめな通報ボタン**（薄い文字色）を追加（`components/report-button.tsx`、理由は任意入力）
- `POST /api/reports`（要ログイン）: `Report` 記録（同一ユーザー重複は1件）→ **通知先メールへ詳細送信**
- 通知先は `REPORT_NOTIFY_EMAIL`（既定 `bootarouapp@gmail.com`）。メール本文に記事タイトル/ID/URL/種別/投稿日時/投稿者/通報者/理由/通報日時を含む
- 送信は SMTP（`lib/email.ts` + nodemailer、`SMTP_*` env）。**未設定時は実送信せずサーバーログに出力**（本番は SMTP 設定が必要）
- `Report` モデル追加（postId/reporterUserId/reason、unique(postId,reporterUserId)）
- 検証（実DB）: 未ログイン401 / 通報200・記録 / 重複は alreadyReported / メール本文（宛先 bootarouapp@gmail.com・詳細）をログで確認 / 詳細ページにボタン表示。typecheck/lint OK

---

## 改善: ノード冗長化（フェイルオーバー）＋ポーラー競合ハードニング ✅ (2026-06-14)
- `NEXT_PUBLIC_SYMBOL_NODE_URL` を**カンマ区切りで複数ノード指定可能**に。`lib/wallet/symbol.ts` に `getNodeUrls()` と `nodeFetch()`（先頭から順にフェイルオーバー：ネットワークエラー/5xx/タイムアウトで次ノードへ、2xx/4xx はそのまま返す）を追加
- ノードを叩く全箇所を `nodeFetch` に統一: ネットワーク情報取得・**TXアナウンス(PUT /transactions)**・残高・通貨モザイク・購入/Thanks検証(`verify.ts`)・SMD(`smd.ts`)・着金ポーリング(`poller.ts`)。同一署名TXは複数ノードに送ってもhash同一で二重化しない
- ポーラーの新規Tip作成に **P2002 ハンドリング**を追加（cron と手動同期の同時実行など txHash 競合時も二重作成せず収束）
- 検証: 先頭に死ノード+正常ノードの構成で cron ポーリングが成功（`scanned:20`、フェイルオーバー成立）。死ノードのみでは `scanned:0` かつ各アドレスはエラーを握りつぶして graceful（cron 200）。typecheck/lint/build OK
- `.env(.example)` に複数ノード指定の記載を追加

---

## 追加機能: YouTube URL 専用リンクカード ✅ (2026-06-14)
- `lib/ogp.ts` に YouTube 判定を追加。`watch?v=` / `youtu.be/` / `shorts/` / `embed/` / `live/` から動画ID(11桁)を抽出
- YouTube の場合は OGP スクレイピングではなく **oEmbed（タイトル・投稿者取得）＋サムネイル（i.ytimg.com/vi/<id>/hqdefault.jpg）** でリンクカード生成（siteName=YouTube）
- oEmbed 失敗時はサムネイルのみで生成（中断しない）。通常Webページは従来どおり OGP 取得
- カードUI（プレビュー/詳細/一覧）は共通OGPフィールドのため変更なし
- 検証: watch / youtu.be → 実タイトル＋サムネイル取得、shorts(無効ID) → フォールバック、通常URL(example.com) → 従来OGP。typecheck/lint OK

---

## 追加機能: 外部コンテンツURL共有投稿（OGP）✅ (2026-06-14)
- 「記事を書く」に**投稿タイプ選択**（記事 / 外部コンテンツのURLを共有）を統合
- `Post` に `postType`(article/external_url) と `url`/`comment`/`ogpTitle`/`ogpDescription`/`ogpImageUrl`/`ogpSiteName`/`tipsEnabled` を追加
- **OGP取得**: `lib/ogp.ts`（SSRF対策＝http/https限定・プライベートホスト拒否・サイズ/時間制限・metaタグ解析）＋ `POST /api/ogp`（要ログイン）。フォームでプレビュー（リンクカード）表示
- 入力: URL / コメント / タグ / 公開日時 / 投げ銭ON-OFF。記事カード・詳細でOGPリンクカード表示
- **販売公開は禁止**（URL投稿は `paid=false` 固定、販売UIは非表示）
- **投げ銭は条件付き**（ON時のみ、「外部コンテンツの購入ではなく紹介・キュレーションへの価値送信」と明記）
- **著作権確認チェック2項目を必須**（未チェックは投稿不可）
- 検証（実DB＋実OGP取得）: OGP取得(example.com)→プレビュー、URL投稿作成（paid=false固定・title自動）、著作権未チェックで保存不可、詳細にOGPカード＋コメント＋外部リンク＋投げ銭ラベル、一覧に「🔗外部リンク」バッジ、通常記事に影響なし。typecheck/lint/build OK

---

## 認証刷新: Symbol DID（チャレンジ署名）＋SMD連携 ✅ 実装完了（人間レビュー必須）(2026-06-14)

**※ メール/パスワード認証を廃止し、Symbol アドレス(DID)主体のチャレンジ署名認証へ全面移行（ユーザー決定）。既存のメール/パスワードアカウントはログイン不可（DIDで作り直し）。秘密鍵はサーバー非送信・ローカル署名。**

### データモデル
- `User`: `symbolAddress @unique`(DID識別子) / `did` / `network` / `publicKey` / `lastLoginAt` を追加。`email`/`passwordHash` を任意化（emailはログインIDではない）。`emailVerified` / `emailNotificationsEnabled` / `websiteUrl` / `symbolNamespace` / `profileSource` / `smdSyncedAt` 追加
- `Challenge`（ワンタイム: address/network/nonce/message/used/expiresAt）、`AuthLog`（監査）追加

### 認証フロー
- `POST /api/auth/challenge`: アドレス検証→ワンタイム nonce＋メッセージ（サービス名/用途/network/address/nonce/発行・有効期限）を生成・保存
- `lib/auth.ts`（Auth.js v5, provider id `did`）: `{challengeId,address,publicKey,signature}` を検証
  - チャレンジ存在/未使用/期限内/アドレス一致/network一致、公開鍵→アドレス導出一致、署名検証（保存messageを使用・クライアント申告のmessageは不使用）、nonce使用済み化、ユーザー upsert、`lastLoginAt`更新、監査ログ
- 署名: `lib/wallet/symbol.ts signChallenge`（クライアント）／検証: `lib/did/verify.ts`（サーバー）。署名検証は Node で実証済み
- UI: `components/auth/did-login.tsx`（端末ウォレットでログイン）／`components/auth/register-flow.tsx`（新規アドレス作成 or 秘密鍵インポート＋**バックアップ確認チェック必須**＋自動ログイン）。旧 email/password UI・`/api/register` は削除

### SMD（social_meta_data）
- `lib/smd.ts`: メタデータキーを UInt64 変換し REST 取得→本人発行(source==target==address)のみ採用→JSON検証（name/imageUrl/url/namespace、https のみ・svg/data:/js: 拒否・画像拡張子チェック・テキストはエスケープ表示）
- `GET /api/smd`（候補プレビュー）／`POST /api/smd/apply`（要ログイン・本人アドレスでサーバー再取得→項目別適用）
- インポート時に候補を確認して項目選択適用。プロフィール編集に「SMDメタデータから同期」(`components/auth/smd-sync.tsx`)。SMDなし/不正でも登録継続

### メール
- ログインIDから除外。プロフィール任意項目（通知・連絡用）。メール未登録でも全機能利用可。`emailNotificationsEnabled` 追加

### 動作確認（実DB + Node署名 + 実testnetノード）
- DID ログイン: challenge→署名→callback 302→セッション発行(7日)、初回はユーザー＋DID自動作成 ✓
- セキュリティ: nonce再利用不可・署名不正拒否・network不一致(N…)は400・再ログインで重複ユーザー作成なし ✓
- 監査ログ: challenge_issued / did_login_success / did_login_failed / did_register 記録 ✓
- SMD: SMD無しアドレスで `{status:"none"}`（登録継続）✓
- typecheck / lint / build（全ルート、challenge/smd/smd-apply 追加・register 削除）✓

### 未実施（人間レビュー時の手動確認）
- 実ブラウザでのウォレット作成/秘密鍵インポート→自動ログイン、ログイン署名
- 実SMD（オンチェーンに social_meta_data がある testnet アドレス）での取得・適用
- ※ 既存メール/パスワードアカウントはログイン不可（DID移行）。サンプル記事等の公開表示は継続

---

## 追加機能: リアクション・Thanks（投稿者→読者の感謝送金）✅ 実装完了（人間レビュー推奨）(2026-06-14)

**※ 投げ銭とは分離。Thanks は固定額・金額を前面に出さない・投稿者が読者へ送る。秘密鍵はローカル署名。**

### データモデル
- `Reaction`（postId, userId, type, unique(post,user,type)）。再クリックでトグル取消（ハード削除）
- `Thanks`（reactionId unique, postId, sender/receiver, addresses, thanksType, amount, currency, txHash unique, status, jpyRate）
- `lib/thanks.ts`: リアクション5種（👍❤️💡🔥🙏）・固定額（Thanks 0.39 / Super Thanks 3.9 XYM）・通貨設定

### リアクション
- `components/reaction-bar.tsx`（記事下部）: 種別ボタン＋件数。ログイン時トグル、未ログインは誘導
- `app/reactions/actions.ts` `toggleReaction`: 重複制御（同一記事・ユーザー・種別は1つ、再クリックで取消）

### Thanks 送信（P2P・運営非預かり）
- `lib/wallet/transfer.ts` `sendThanks`（マーカー `nagexym:thanks:<reactionId>`）。ローカル署名・アナウンス
- `components/thanks-buttons.tsx`: 通常は「Thanks!」「Super Thanks」のみ表示（金額非表示）。確認段で金額・送信先を表示（透明性）→ パスワード入力→送信
- `app/api/thanks`: サーバーが**ノードでTX検証**（受取=読者アドレス・金額≥規定・マーカー一致・送信者=署名者）後に記録。投稿者のみ送信可・自分宛不可・受取アドレス未登録は不可・1リアクション1回（重複409）
- 受取アドレス未登録の読者には「受取アドレス未設定」でボタン無効化

### 通知（`/notifications`、ヘッダーに「通知」）
- 自分の記事への他ユーザーのリアクション一覧（種別・記事・日時・Thanks/Super Thanksボタン・送信済み表示）
- 自分が受け取った Thanks 一覧（送信者・記事・種別・日時・txHash）

### 動作確認（実DB + スタブノードでE2E）
- リアクションバー描画・件数表示（💡1）✓
- Thanks送信（投稿者→読者, 検証付き）→ `{ok,confirmed:true}` 記録（amount 0.39, status confirmed）✓
- 重複409・非投稿者403 ✓
- 通知: 投稿者側にリアクション＋「送信済み」、読者側に「Thanksが届きました」✓
- typecheck / lint / build OK

### 受け入れ条件
リアクション表示/投稿/重複制御・一覧確認・通知・通知内Thanksボタン・Thanks0.39/Super3.9・通常UIで金額非表示・確認画面で金額と送信先・パスワード入力・秘密鍵非送信/ローカル署名・送信履歴・重複防止・受信者通知・投げ銭と分離・運営非預かり — いずれも満たす

---

## 追加機能: 円換算（取引時レート）・期間/種別/状態フィルタ ✅ (2026-06-14)
- `Tip` / `Purchase` に `jpyRate`（記録時点の XYM/JPY レート）を追加。記録時に保存し税務の円換算に使用
  - `lib/rates.ts`: CoinGecko から XYM/JPY を取得（60秒キャッシュ・`XYM_JPY_RATE_URL` で差し替え可）。`/api/tips`・`/api/purchases`・ポーラーで保存
- `lib/sales/query.ts`: 期間(from/to 月)・種別(販売/投げ銭)・状態(確定のみ)でフィルタした統合記録を返す共通関数。円換算額(数量×記録時レート)を算出
- 販売ダッシュボード: フィルタフォーム＋現在レート表示＋サマリ(XYM/円)＋月次テーブル(販売/投げ銭の件数・XYM・円・合計円)
- `/api/sales/export`: 同フィルタ対応。列に「レート(JPY/XYM)」「円換算額(取引時)」を追加
- 注記: 円換算は記録時点レートの参考値。最終評価・記帳・申告は販売者責任（運営は預からない/代行しない）
- 検証: レート保存・円換算表示・期間/種別/状態フィルタ・CSV(フィルタ連動・レート列)を確認。typecheck/lint OK

## 追加機能: 販売ダッシュボード（月次集計・会計用CSV）✅ (2026-06-14)
- マイ記事(`/dashboard`)に `components/sales-dashboard.tsx` を追加
  - 累計売上(販売)/累計投げ銭/今月の売上・投げ銭のサマリ
  - 月次テーブル（年月ごとの販売件数・販売額・投げ銭件数・投げ銭額・合計、直近12か月、JST基準）
  - 金額表示は `formatXym` で丸め
- `GET /api/sales/export`: 販売＋投げ銭の **会計用 CSV**（BOM付き・JST日時・種別/記事/金額/通貨/送金元/txHash/状態）
- 非カストディアル方針の明記: 金額は受領XYM数量。法定通貨換算・記帳・申告は販売者責任（運営は売上を預からず会計・税務も代行しない）
- 検証: ダッシュボード描画・CSV出力（Content-Disposition/BOM/金額整形）確認、typecheck/lint/build OK

## 追加機能: 有料記事・購読権販売（ノンカストディアルP2P）✅ 実装完了（人間レビュー推奨）(2026-06-14)

**※ 秘密鍵で署名する購入フローを含む。運営は送金を預からない設計。**

### データモデル
- `Post`: `paid` / `paidHtml`(有料部分) / `priceAmount` / `priceCurrency` / `sellerAddress` / `publishAt` を追加
- `Purchase` モデル追加（postId, buyerUserId, buyerAddress, sellerAddress, amount, currency, txHash[unique], confirmed, purchasedAt）
- `User`: `tokushoho`(特商法表記) / `salesTerms`(販売条件) 追加

### 公開方式・販売設定（エディタ）
- 公開方式を「通常公開 / 販売公開」から選択（`components/post-form.tsx`）
- 試し読み＝**無料部分(`contentHTML`)** と **有料部分(`paidHtml`)** を別エディタで入力（サニタイズ堅牢化のため区切りマーカーではなく2フィールド方式）
- 価格 / 通貨(XYMのみ) / 販売者アドレス(ウォレット登録アドレスをプレフィル) / 公開日時
- §10 警告文・§11 法令対応同意チェックを表示。**販売公開は同意必須**（`savePost` で未同意は保存不可）

### 表示制御
- 未購入: 試し読みのみ＋購入パネル（`components/purchase-panel.tsx`：記事/投稿者/価格/送金先/注意事項を表示）
- 購入済み or 著者: 全文表示（「購入済み」表示）
- `publishAt` が未来の記事は著者以外に非表示
- 一覧/詳細に「有料 N XYM」バッジ

### 購入フロー（P2P・運営は預からない）
- クライアントで販売者アドレスへ署名・アナウンス（`sendPurchase`、メッセージ `nagexym:buy:<postId>`）
- `POST /api/purchases`: **サーバーがノードでTXを検証**（送金先=販売者・金額≥価格・マーカー一致・送金元=署名者）してから `Purchase` を記録（クライアント申告の偽造で解除不可）
- 購入はログインユーザーに紐付け → ログインで全端末復元（チェーン由来復元は将来拡張）

### プロフィール法務情報（§9）
- 編集画面に「特商法表記」「販売条件」（複数行・HTML不可）。公開プロフィールに入力時のみ表示（エスケープ表示）

### 動作確認（実DB + スタブSymbolノードでE2E）
- 未購入(匿名): 試し読み表示・有料部分非表示・購入パネル/有料バッジ表示 ✓
- 購入API: 正当TX → `{ok,confirmed:true}` 記録・全文解除（「購入済み」表示）✓ / 不正TX → 409 ✓
- 検証ロジック: メッセージ復号バグ(tip専用判定)を修正し buy マーカー対応 ✓
- プロフィール法務情報: 表示 ✓
- `typecheck` / `lint` / `build`（Next16）すべて成功

### 受け入れ条件 対応状況
通常/販売の選択・価格設定・試し読み範囲・公開日時・未購入は試し読みのみ・購入済みは全文・購入確認画面(価格/販売者/送金先)・P2P送金・運営非預かり・購入記録・購入状態復元・法務情報登録・販売時警告・同意必須・無料記事に影響なし・ノンカストディアル維持 — いずれも満たす

---

## Phase 1: プロジェクト初期化・DBスキーマ・認証 ✅ 完了 (2026-06-13)

### 実装内容

#### プロジェクト初期化
- Next.js (App Router) + TypeScript + Tailwind CSS + ESLint をセットアップ
- ディレクトリ構成: `app/`（ルーティング）, `components/`（UI）, `lib/`（共通ロジック）, `types/`（型定義）, `prisma/`（スキーマ）

#### DBスキーマ (`prisma/schema.prisma` / Prisma 7)
- `postgresql` データソース
- 仕様書 §4 に準拠したモデルを定義: `User` / `Post` / `Comment` / `Tip`
  - `User.xymAddress` は**公開アドレスのみ**保持（秘密鍵・ニーモニックは一切保存しない）
  - リレーションに `onDelete: Cascade` と検索用インデックスを付与
  - `contentHTML` / `Comment.body` は `@db.Text`
- **Prisma 7 対応**:
  - datasource から `url` を削除（Prisma 7 仕様）。Migrate/CLI 用の接続情報は `prisma.config.ts` に集約
  - アプリ実行時は **driver adapter（`@prisma/adapter-pg` + `pg`）** 経由で接続（`lib/prisma.ts`）
- Prisma Client 生成済み (`npx prisma generate`)

#### 認証 (Auth.js v5 / メールアドレス + パスワード)
- `lib/auth.ts`: `NextAuth({...})` から `{ handlers, auth, signIn, signOut }` を export
  - `Credentials` プロバイダによる email + password 認証
  - セッション戦略は **JWT**（Credentials プロバイダの要件）
  - パスワード照合は `bcryptjs`、JWT/Session コールバックで `user.id` を伝播
- `app/api/auth/[...nextauth]/route.ts`: `handlers` から GET/POST を re-export
- `app/api/register/route.ts`: ユーザー登録 API
  - 入力を zod (`registerSchema`) で検証
  - パスワードは `bcrypt.hash(password, 12)` でハッシュ化して保存（平文・ハッシュ前の値はログ出力しない）
  - email 重複 (Prisma `P2002`) は 409 で返却
- `types/next-auth.d.ts`: `session.user.id` の型拡張
- 画面（サーバー側セッション取得は `auth()`、クライアントは `next-auth/react` の signIn/signOut/SessionProvider）:
  - `app/register/page.tsx` + `components/register-form.tsx`（登録→自動ログイン）
  - `app/login/page.tsx` + `components/login-form.tsx`（`useSearchParams` は Suspense でラップ）
  - `app/page.tsx`: セッション状態に応じてログイン/登録リンク or ログアウトを表示
  - `components/sign-out-button.tsx`, `components/providers.tsx`（`SessionProvider`）

#### 環境変数
- `.env.example` / `.env` を作成（`.env` は `.gitignore` 済み）
- `DATABASE_URL`, `AUTH_SECRET`（Auth.js v5）を設定。`AUTH_URL` は通常自動検出のため任意
- 将来フェーズ用に Symbol（テストネット）・S3 互換ストレージのプレースホルダも記載

### セキュリティ確認
- 秘密鍵・ニーモニック・ウォレットパスフレーズを扱うコードは未導入（Phase 5 以降）
- サーバーに送信・保存される認証情報は email とパスワードハッシュのみ
- 入力は zod で検証、DB アクセスはすべて Prisma 経由（パラメータ化）

### 動作確認手順
1. PostgreSQL を用意し `.env` の `DATABASE_URL` を設定
2. `npm run db:push`（または `npm run db:migrate`）でスキーマを反映
3. `npm run dev` で起動
4. `/register` で新規登録 → 自動ログインされトップに `ログイン中: <表示名>` が表示される
5. ログアウト → `/login` で再ログインできることを確認
6. 既存メールでの再登録が「既に登録されています」(409) になることを確認

### ビルド・チェック結果（最新スタックで再検証）
- `npm run typecheck` (tsc --noEmit): エラーなし
- `npm run build`: 成功（Next 16 / Turbopack、全ルート生成）
- `npm run lint` (eslint flat config): 警告・エラーなし
- ランタイム smoke test: `npm run dev` で `/`・`/register`・`/login` が HTTP 200 を返すことを確認

### 環境・バージョン方針（重要）
- ランタイムは **Node.js 22 LTS（v22.22.3）** を採用（ユーザー決定）。nvm 経由でインストール済み。
  - 注意: このリポジトリの Bash ツールは非対話シェルで `.bashrc` の nvm ブロックを読まないため、
    コマンド実行時は先頭で `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"` を実行して Node 22 を有効化すること
    （`nvm alias default 22` 設定済みなので対話シェル/新規ターミナルでは自動で 22）。
- スタックは**最新版に移行済み**:
  - **Next.js 16.2.x（App Router / Turbopack）+ React 19**
  - **Auth.js v5（next-auth v5 beta）** — App Router ネイティブ
  - **Prisma 7**（driver adapter `@prisma/adapter-pg` + `pg`、設定は `prisma.config.ts`）
  - **Tailwind CSS v4**（`@import "tailwindcss"`、`@tailwindcss/postcss`）
  - **ESLint 9（flat config / `eslint.config.mjs`）**
  - 経緯: 当初 Node 18 制約で Next 14 系に固定 → Node 22 LTS 導入後に最新版へ移行。

---

## Phase 2: プロフィール編集（アイコン・X連携・表示名/bio）✅ 完了 (2026-06-13)

### 実装内容

#### 画像ストレージ抽象 (`lib/storage.ts`)
- `saveImage(file, prefix)`: 画像を保存し公開 URL を返す共通関数（アバター・記事画像で再利用）
  - S3 互換ストレージ（`@aws-sdk/client-s3`、エンドポイント/リージョンを環境変数で切替）が設定済みならそちらへ
  - 未設定の開発環境では `public/uploads/<prefix>/` にフォールバック保存
  - 形式チェック（png/jpeg/webp/gif）・サイズ上限 5MB・空ファイル拒否（`ImageValidationError`）
- `app/api/upload/route.ts`: 要ログインのアップロード API（multipart `file` を受け取り `{ url }` を返す）

#### プロフィール編集
- `app/profile/page.tsx`: サーバーコンポーネント。`auth()` で未ログインなら `/login?callbackUrl=/profile` へリダイレクト
  - 自分の `displayName` / `bio` / `xAccount` / `avatarUrl` / `xymAddress` を表示
  - `xymAddress` は読み取り表示のみ（Phase 5 のウォレット生成で自動設定）
- `components/profile-form.tsx`: クライアントフォーム（React 19 `useActionState`）
  - アバターは選択時に `/api/upload` へ送信 → 返った URL をプレビュー＆hidden field に保持
  - 画像削除ボタン、プレースホルダ `public/avatar-placeholder.svg`
- `app/profile/actions.ts`: サーバーアクション `updateProfile`
  - `auth()` で本人確認 → zod (`profileSchema`) で検証 → `prisma.user.update`
  - X ハンドルは先頭 `@` を除去して保存、空文字は `null` 化、`revalidatePath`
- `lib/validations.ts`: `profileSchema` 追加（X ハンドルの形式・bio 文字数・avatarUrl 形式を検証）
- `app/page.tsx`: ログイン時に「プロフィール編集」リンクを追加

### セキュリティ確認
- アップロード・プロフィール更新はいずれも `auth()` でログイン必須・本人のみ
- 秘密鍵等は一切扱わない。保存するのは公開情報（表示名/bio/X/アバターURL）のみ
- 入力は zod 検証、DB は Prisma 経由

### 動作確認（実 DB / Docker postgres:16 で E2E 実施・全て成功）
- 登録 API: 正常 201 / メール重複 409 / 不正入力 400
- 未ログイン時: `/profile` → 307（`/login?callbackUrl=/profile`）、`/api/upload` → 401
- NextAuth credentials ログイン（CSRF→callback）→ セッション cookie 発行、`/api/auth/session` に `user.id` 含む
- ログイン後: `/profile` 200（自分の情報表示）、トップに「プロフィール編集」リンク表示
- アバターアップロード: 201＋URL、`public/uploads/avatars/` に保存、再取得 200、非画像は 400
- プロフィール更新（サーバーアクション）: DB に `displayName`/`bio`/`xAccount`(先頭@除去)/`avatarUrl` が反映されることを確認
- `npm run typecheck` / `npm run lint` / `npm run build`（Next 16）すべて成功

### ローカルで DB を使う場合
- `docker run -d --name nagexym-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=nagexym -p 5432:5432 postgres:16`
- `npm run db:push` → `npm run dev`

---

## Phase 3: 記事投稿（Tiptap エディタ・画像アップロード・CRUD）✅ 完了 (2026-06-13)

### 実装内容

#### リッチテキストエディタ
- `components/editor/tiptap-editor.tsx`: Tiptap v3 エディタ（クライアント）
  - `StarterKit`（見出し1-3 / 太字 / 斜体 / リスト / 引用 / コードブロック / リンク）＋ `Image` 拡張
  - ツールバーから本文中に画像挿入（`/api/upload` 再利用、prefix=`posts`）、リンク設定
  - SSR ハイドレーション対策に `immediatelyRender: false`
  - `prose`（`@tailwindcss/typography`）で本文スタイリング

#### 記事フォーム・ページ
- `components/post-form.tsx`: タイトル / カバー画像（`/api/upload` prefix=`covers`）/ 本文エディタ / 公開チェックボックス
  - 本文 HTML は hidden field で `savePost` に渡す（React 19 `useActionState`）
- `app/posts/new/page.tsx`: 新規作成（要ログイン）
- `app/posts/[id]/edit/page.tsx`: 編集（要ログイン＋**本人の記事のみ**、他者は `/dashboard` へ）
- `app/dashboard/page.tsx`: マイ記事一覧（自分の記事のみ、公開/下書きバッジ、編集/公開切替/削除）
- `app/page.tsx`: ログイン時に「記事を書く」「マイ記事」リンクを追加

#### CRUD サーバーアクション (`app/posts/actions.ts`)
- `savePost`: 作成/更新を共通化。`auth()` → zod (`postSchema`) → **`sanitizePostHtml` でサニタイズ** → Prisma 保存。更新時は `authorId` 一致を検証
- `deletePost` / `togglePublish`: いずれも本人の記事のみ（`authorId` 検証）

#### XSS 対策（CLAUDE.md 必須）
- `lib/sanitize.ts`: `sanitize-html` による許可リスト方式のサニタイズ
  - 許可タグ: 見出し/段落/装飾/リスト/引用/コード/リンク/画像 等のみ
  - `a` は http/https/mailto のみ、`target=_blank` + `rel="noopener noreferrer nofollow"` を強制付与
  - `img` は http/https と相対 `/uploads/...` のみ
  - 保存時に必ず通し、DB には常にサニタイズ済み HTML のみ格納

### 動作確認（実 DB / Docker postgres:16 で E2E 実施・全て成功）
- 記事作成（公開）→ 303 で `/dashboard` へ。DB にサニタイズ済み HTML が保存される
  - 投入した XSS ペイロードの結果: `<script>` 除去 / `<img onerror>` の `onerror` 除去 / `href="javascript:"` 除去 / `href="https://"` は rel付きで保持 / 見出し・リスト・相対画像は保持
- 所有権:
  - 別ユーザー(bob)が他人(alice)の編集ページ `/posts/{id}/edit` → 307 で `/dashboard`
  - bob の `/dashboard` に alice の記事は表示されない
  - bob が `deletePost` を直接叩いても alice の記事は削除されない（サーバー側 `authorId` ガード）
- 本人(alice): `togglePublish` で公開↔下書き、`deletePost` で削除が反映される
- `npm run typecheck` / `npm run lint` / `npm run build`（Next 16）すべて成功

---

## Phase 4: 記事一覧・詳細・コメント機能 ✅ 完了 (2026-06-13)

### 実装内容

#### 共通ヘッダー
- `components/site-header.tsx`（`useSession`）を `app/layout.tsx` に追加
  - 未ログイン: ログイン / 新規登録、ログイン時: 記事を書く / マイ記事 / プロフィール / ログアウト
- 旧 `components/sign-out-button.tsx` はヘッダーに統合のため削除

#### 記事一覧（トップ `/`）
- `app/page.tsx`: 公開記事のみ・新着順・ページネーション（1ページ10件、`?page=` クエリ）
- 各記事カード: カバー画像・タイトル・抜粋（`htmlToText` でHTML→テキスト化）・著者・日付
- `lib/sanitize.ts` に `htmlToText`（`sanitize-html` で全タグ除去して抜粋生成）を追加

#### 記事詳細（`app/posts/[id]/page.tsx`）
- 公開記事は誰でも閲覧可。**非公開（下書き）は著者本人のみ**（それ以外は 404）
- 本文は保存時にサニタイズ済みの HTML を `prose`（typography）で表示
- `components/author-card.tsx`: 著者のアイコン・表示名・X リンク・bio・XYM アドレス（公開のみ表示）
  - ※ XYM アドレスの QR / 投げ銭ボタンは Phase 6 で追加予定
- 著者本人には編集リンクを表示
- `app/dashboard/page.tsx` に「表示」リンクを追加

#### コメント機能
- `lib/validations.ts`: `commentSchema`（body 1〜1000文字）
- `app/comments/actions.ts`:
  - `addComment`: 要ログイン。公開記事のみ（著者は自身の下書きにも可）。`prisma.comment.create`
  - `deleteComment`: **コメント投稿者 または 記事の著者 のみ**削除可（サーバー側でガード）
- `components/comment-form.tsx`（`useActionState`、投稿成功で textarea リセット＋再取得）
- 詳細ページにコメント一覧（投稿者アイコン/名前/日時/本文）と、権限がある場合のみ削除ボタンを表示
- 未ログイン時はログイン誘導を表示

### 動作確認（実 DB / Docker postgres:16 で E2E 実施・全て成功）
- 一覧: 公開記事のみ表示・下書きは非表示
- 詳細: 公開記事は匿名で 200、下書きは匿名 404 / 著者は 200（下書きバッジ表示）
- コメント投稿（bob）→ DB に保存・一覧表示
- コメント削除の権限:
  - 第三者(carol)が直接 `deleteComment` を叩いても削除されない
  - 記事著者(alice)は他人(bob)のコメントを削除できる
- `npm run typecheck` / `npm run lint` / `npm run build`（Next 16）すべて成功
  - ※ build 中に `next/font/google`（Geist）の取得が一時的に失敗することがある（ネットワーク起因、再実行で成功）

---

## Phase 5: ウォレット生成・ニーモニックバックアップ・暗号化保存・復元 ✅ 実装完了（人間レビュー待ち）(2026-06-13)

**※ 秘密鍵を扱う最重要フェーズ。CLAUDE.md に従い、コミット前に人間レビューを必須とする（自動 commit/push しない）。**

### 実装内容（すべて秘密はクライアント内で完結）

#### ローカル鍵暗号化 (`lib/wallet/crypto.ts`)
- **Web Crypto API のみ**使用。PBKDF2(SHA-256, 300,000回) で鍵導出 → **AES-256-GCM** で秘密鍵(hex)を暗号化
- salt(16B)・iv(12B) は暗号化ごとにランダム生成
- 保存フォーマットは仕様書 §5 準拠: `{ version:1, address, salt(b64), iv(b64), ciphertext(b64) }`
- 復号失敗（パスフレーズ誤り＝GCM認証失敗）は `WrongPassphraseError`

#### Symbol 鍵導出 (`lib/wallet/symbol.ts`)
- `symbol-hd-wallets` + `symbol-sdk`(v2) で BIP39 ニーモニック生成・HD導出（path `m/44'/4343'/0'/0'/0'`）
- ネットワーク/ノードは環境変数（`NEXT_PUBLIC_SYMBOL_NETWORK`=testnet / `NEXT_PUBLIC_SYMBOL_NODE_URL`）
- 残高は REST を直接 fetch（読み取り専用・秘密鍵不要）
- `lib/wallet/polyfill.ts`: ブラウザ用 `Buffer` ポリフィル（symbol import より前に評価）

#### 保存・UI（クライアント）
- `lib/wallet/storage.ts`: 暗号化済みデータを localStorage(`nagexym.wallet.v1`) に保存（公開アドレスと暗号文のみ）
- `components/wallet/create-wallet.tsx`: 生成 → 24語表示（警告）→ **バックアップ確認（ランダム2語入力、未確認では先に進めない）** → パスフレーズ設定（ログインPWと別にする旨を案内）→ 暗号化保存
- `components/wallet/restore-wallet.tsx`: リカバリーフレーズ＋パスフレーズから復元
- `components/wallet/wallet-manager.tsx`: 状態管理（未所持→作成/復元、所持→アドレス表示・残高・アンロック・削除）。アンロック時のみメモリ上で秘密鍵を復号保持（永続化しない）
- `app/wallet/page.tsx`（要ログイン）、ヘッダーに「ウォレット」リンク

#### サーバー（公開アドレスのみ）
- `app/api/wallet/address/route.ts`: 要ログイン。`walletAddressSchema`（`^[A-Z2-7]{39}$`）で検証し `User.xymAddress` を更新
  - **zod が `address` 以外のフィールドを無視するため、誤って privateKey 等を送っても保存されない**
  - サーバーには秘密鍵を保存する場所（カラム）自体が存在しない

### セキュリティ確認（CLAUDE.md 準拠）
- 秘密鍵・ニーモニック・パスフレーズを**サーバーへ送信/保存/ログ出力しない**（grep で送信箇所が公開アドレスのみであることを確認）
- 暗号化は Web Crypto API のみ・独自暗号なし・PBKDF2 + AES-256-GCM
- localStorage に保存するのは暗号文＋公開アドレスのみ

### 動作確認
- Node 単体テスト（`crypto.ts` 実コード＋導出）: encrypt/decrypt 往復で秘密鍵一致 / 保存JSONに平文鍵が含まれない / 復号鍵から同一アドレス再導出 / 誤パスフレーズ拒否 / salt・iv が毎回異なる / ニーモニック→testnetアドレス（`T`始まり）・決定論的復元 — **すべて PASS**
- サーバー E2E（Docker postgres:16）: `/wallet` 未ログイン307 / API 401・400・200 / **privateKey/mnemonic を含むリクエストでも `xymAddress` のみ保存** / User テーブルに秘密系カラムなし / `/wallet` ログイン時 SSR 200（symbolモジュールのサーバー評価で例外なし）
- `npm run typecheck` / `npm run lint`（react-hooks/set-state-in-effect 等の新ルール対応含む）/ `npm run build`（Next16/Turbopack、symbol-sdk + Buffer ポリフィルのバンドル成功）すべて成功

### 未実施（人間レビュー時にお願いしたい手動確認）
- **実ブラウザでの操作確認**（この環境にブラウザがないため未実施）:
  1. `/wallet` で「新しいウォレットを作成」→ 24語表示 → 確認 → パスフレーズ設定 → アドレス表示
  2. リロード後もアドレスが残る（localStorage）／別ブラウザでフレーズから復元すると同一アドレス
  3. アンロックで秘密鍵がメモリ上のみ復号、ロックで消える
  4. テストネット Faucet で入金 → 「残高更新」で反映
- DevTools の Network で、ウォレット操作中にサーバーへ送られるのが公開アドレスのみであることの目視確認

---

## Phase 6: 投げ銭送金フロー（スライダー・署名・アナウンス・記録・表示）✅ 実装完了（人間レビュー待ち）(2026-06-13)

**※ 秘密鍵で署名するフェーズ。コミット前に人間レビュー必須（自動 commit/push しない）。署名・アナウンスは全てクライアントで実行。**

### データモデル拡張 (`prisma/schema.prisma`)
- `Tip` に `fromUserId`(任意・履歴用, onDelete:SetNull) / `anonymous` / `message` を追加、`User.sentTips` リレーション追加

### 送金（クライアント / `lib/wallet/transfer.ts`）
- `fetchNetworkParams()`: ノードから generationHash / epochAdjustment / currencyMosaicId を取得（キャッシュ）
- `buildSignedTip()`: `symbol-sdk` の `TransferTransaction` を作成・`setMaxFee(100)`・**秘密鍵で署名**（純粋関数）。メッセージに `nagexym:tip:<postId>` マーカー
- `announceTransaction()`: ノードへ PUT `/transactions`
- `sendTip()`: 上記をまとめて実行し txHash を返す。秘密鍵は引数で受け取りメモリ上のみで使用

### UI
- `components/tip/tip-box.tsx`（記事詳細）:
  - **0.1〜10 XYM をスライダー**（step 0.1）で設定、匿名チェック、著者アドレスの**QRコード**（`qrcode`）
  - パスフレーズでウォレットを復号 → 署名・アナウンス → `/api/tips` に控えを記録 → 成功時 tx ハッシュとエクスプローラーリンク表示
  - 著者本人/著者アドレス未設定/ウォレット未所持はそれぞれ案内表示
- 記事詳細: **投げ銭インジケータ（合計 XYM・件数）** ＋ 最近の投げ銭一覧（匿名は「匿名」表示）
- 記事一覧（トップ）: 各カードに投げ銭合計バッジ
- `app/tips/page.tsx`: **投げ銭履歴**（送った／受け取った、各合計とエクスプローラーリンク）。ヘッダーに「投げ銭履歴」リンク

### サーバー記録 (`app/api/tips/route.ts`)
- 要ログイン。`tipSchema`（amount 0.1〜10, txHash 64hex, fromAddress 形式）で検証
- **toAddress はクライアント申告を信用せず、記事著者の `xymAddress` をサーバー側で採用**
- 自分の記事への投げ銭は拒否、著者アドレス未設定は拒否、txHash 重複は 409（二重記録防止）
- 送信者ユーザー(`fromUserId`)・匿名フラグを記録
- ※ オンチェーンの着金確認（ポーリング）は Phase 7 で追加予定。現状はクライアント申告＋サーバー検証で記録

### セキュリティ確認
- 署名はクライアントのみ。サーバーへ送るのは txHash・金額・送信元アドレス（公開情報）のみで、**秘密鍵・パスフレーズは送らない**
- 投げ銭額・送金先・自己投げ銭・重複をサーバー側で検証

### 動作確認
- Node テスト（symbol-sdk）: TransferTransaction の種別・金額(2.5XYM=2,500,000micro)・宛先・メッセージマーカー・署名hash(64hex)・payload・maxFee(0.02XYM) — **全 PASS**
- サーバー E2E（Docker postgres:16）:
  - `/api/tips` 201（通常/匿名）・409（txHash重複）・400（自己投げ銭/範囲外）・401（未ログイン）
  - 保存 Tip の `toAddress` が著者アドレスに固定・`fromUserId` 記録を確認
  - 記事詳細「合計 3.5 XYM・2 件」、一覧バッジ「💴 3.5 XYM・2件」、履歴（送った/受け取った 合計 3.5 XYM）を表示確認
- `npm run typecheck` / `npm run lint` / `npm run build`（Next16/Turbopack）すべて成功

### 未実施（人間レビュー時の手動確認をお願いします）
- 実ブラウザ＋テストネット入金済みウォレットでの**実送金**（スライダー→パスフレーズ→署名→アナウンス→エクスプローラー反映）
- DevTools で送信内容が公開情報のみであることの目視確認
- QR は現状「著者アドレス」を符号化（簡易版）。Symbol URI スキーム準拠の完全版は今後の拡張余地

---

## Phase 7: 投げ銭受信検知（サーバー側ポーリング）・記事への紐付け ✅ 完了 (2026-06-13)

### データモデル
- `Tip.confirmed Boolean @default(false)` を追加（false=クライアント申告/確認中、true=オンチェーン確定）

### ポーリング (`lib/tips/poller.ts`, server-only)
- `decodeMessage()`: Symbol 平文メッセージ（先頭 0x00 + UTF-8 hex）をデコード（純粋関数）
- `parseTipTransaction()`: REST のトランザクションから `nagexym:tip:<postId>` マーカー・通貨モザイク額・署名者公開鍵→送信元アドレスを抽出（純粋関数）
- `pollAddressTips(address)`: ノードの確定済み送金（`/transactions/confirmed?recipientAddress=&type=16724`）を取得し、
  - マーカーの postId が実在し宛先が記事著者アドレスと一致するもののみ採用
  - txHash で upsert: 既存（クライアント申告）は `confirmed=true` に更新、無ければ確定済みで新規作成
  - 送信元アドレスからユーザーを推定して履歴に紐付け（無ければ null）
- `pollAllTips()`: `xymAddress` 登録済みの全著者を対象（cron 用）

### トリガー
- `app/api/cron/poll-tips/route.ts`: `CRON_SECRET` の Bearer 認証で保護（外部 cron 用、GET/POST）
- `app/tips/actions.ts` `syncMyTips`＋`components/tip/sync-tips-button.tsx`: ログインユーザーが自分の着金を手動同期（`/tips` の「着金を同期」ボタン）
- `.env(.example)` に `CRON_SECRET` 追加

### 表示
- 記事詳細・投げ銭履歴の各 Tip に **確定 / 確認中** バッジを表示

### 動作確認（実 DB + スタブ Symbol ノードで E2E）
- スタブノードが `nagexym:tip:<postId>` マーカー付き確定送金2件を返す構成で検証:
  - cron 認証: 認証なし/誤シークレット → 401、正シークレット → 200
  - 1回目: `scanned 2, confirmed 2, created 1`（事前投入した確認中Tipは確定に更新、新規1件は確定で作成）
  - 保存結果: 両 Tip が `confirmed=true`・正しい postId・著者宛 `toAddress`・正しい額（2.5 / 1.0）
  - **冪等性**: 2回目は `created 0, confirmed 0`、件数は2のまま（txHash で重複排除）
- `npm run typecheck` / `npm run lint` / `npm run build`（Next16/Turbopack）すべて成功

### 運用メモ
- 定期実行は外部 cron から `GET /api/cron/poll-tips`（`Authorization: Bearer $CRON_SECRET`）を叩く想定
- 個人利用はユーザーが `/tips` の「着金を同期」で都度取得可能

---

## Phase 8: UI/UX ブラッシュアップ・デプロイ設定 ✅ 完了 (2026-06-13)

### セキュリティヘッダ / CSP（仕様書 §6）
- `next.config.ts` の `headers()` で全パスに付与:
  - **Content-Security-Policy**（default-src 'self' をベースに、img は data:/blob:/https:、connect は https:、
    script/style は Next/next-font のため 'unsafe-inline'。開発時のみ 'unsafe-eval' と ws: を許可）
  - X-Content-Type-Options / X-Frame-Options(DENY) / Referrer-Policy / Permissions-Policy

### UI/UX
- 共通フッター `components/site-footer.tsx`（ネットワーク表示・非保管の注記）、レイアウトを sticky footer 化
- `app/not-found.tsx`（404）・`app/error.tsx`（エラーバウンダリ、error をログ）・`app/loading.tsx`（スケルトン）
- メタデータ整備: ルートに `metadataBase`・title テンプレート・OG、記事詳細に `generateMetadata`（タイトル/抜粋/OG画像）

### デプロイ設定
- `README.md` を全面刷新（セットアップ・スクリプト・環境変数・Symbol/テストネット・着金ポーリング・Vercel デプロイ・セキュリティ）
- `vercel.json`: `crons` で `/api/cron/poll-tips` を定期実行（Vercel は cron に `Authorization: Bearer $CRON_SECRET` を自動付与）
- `.env(.example)` に `NEXT_PUBLIC_SITE_URL` 追加

### 動作確認
- 実行時に CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy が付与されることを確認
- フッター/ネットワーク表示・記事一覧の描画、404 ページ表示を確認
- `npm run typecheck` / `npm run lint` / `npm run build`（Next16/Turbopack、全 16 ルート）すべて成功

### メインネットについて
- 既定はテストネット。`NEXT_PUBLIC_SYMBOL_NETWORK` で切替可能だが、**メインネット運用は明示的指示があるまで行わない**。

---

## 追加機能（ユーザー要望）(2026-06-13)
- 記事詳細ヘッダー（著者名・日付の並び）に投げ銭合計バッジを表示（下部セクションは維持）
- ナビゲーション: 記事詳細に「← 記事一覧へ戻る」リンク、一覧に絞り込み中表示＋「すべて表示」
- 検索: トップで記事検索（タイトル/本文を部分一致・大文字小文字無視）。`/?q=`
- タグ: `Post.tags String[]`（GINインデックス）。エディタでタグ入力（カンマ区切り）、
  詳細・一覧にタグchip、トップにタグナビ（上位タグ）、`/?tag=` で絞り込み。ページネーションは q/tag を保持
- 検証: タグ絞り込み/検索/該当なし表示/詳細のタグ・戻るリンクを実 DB で確認済み。typecheck/lint/build 成功

## 全フェーズ完了 🎉
Phase 1〜8 まで実装・検証済み。残課題（任意の強化）:
- nonce ベースの厳格化 CSP（現状は 'unsafe-inline' 許容）
- 投げ銭 QR の Symbol URI スキーム完全準拠
- Phase 5/6（秘密鍵を扱う部分）の人間によるブラウザ実機レビュー
