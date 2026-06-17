# Harbor 現状仕様書 (current-spec.md)

> 本書は **実際のコードベースを正** として、2026-06-16 時点の実装を調査して記述したもの。
> `docs/spec.md` / `CLAUDE.md` は参考であり、相違点は本書末尾「旧仕様との相違」に記載する。

Harbor（リポジトリ名 `nageXym`）は Symbol(XYM) 投げ銭機能付きのノンカストディアル・ブログ。
秘密鍵はブラウザ内で暗号化保存し、サーバーには公開アドレスのみを保持する。

---

## 1. 技術スタック（package.json 実測）

- **Next.js 16.2.9（App Router / Turbopack）** + **React 19.2.4** + TypeScript
- **Tailwind CSS v4**（`@tailwindcss/postcss` / `@tailwindcss/typography`）。フォントは**システムフォント**（`next/font/google` は不使用）
- **Auth.js v5（next-auth ^5 beta）** — Credentials プロバイダで **Symbol DID（チャレンジ署名）認証**
- **PostgreSQL + Prisma 7**（driver adapter `@prisma/adapter-pg` + `pg`、`prisma.config.ts`）
- **symbol-sdk 2.0.7 / symbol-hd-wallets 0.14.2**（鍵導出・署名・送金・検証。ブラウザで WebAssembly を使用）
- **Web Crypto API**（PBKDF2 + AES-256-GCM、ローカル鍵暗号化）
- **Tiptap v3**（リッチテキストエディタ）
- **sanitize-html**（XSS サニタイズ）、**sharp**（画像リサイズ）、**nodemailer**（通報メール）、**qrcode**、**zod**、**bcryptjs**（旧名残・現在未使用）
- 画像: **S3 互換ストレージ**（未設定時は `public/uploads/` フォールバック）

### ランタイム / インフラ
- `proxy.ts`（Next.js 16 のミドルウェア後継）: HTML ドキュメントに `Cache-Control: no-cache, must-revalidate` を付与（静的アセット/画像/API は除外）。古い HTML/JS キャッシュの取りこぼし防止。
- `next.config.ts`: 全パスにセキュリティヘッダ。CSP は `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`（dev のみ `'unsafe-eval'`）、`frame-src` に YouTube、`img-src https:`、`frame-ancestors 'none'` 等。
- `public/sw.js`: 通知用 Service Worker（`notificationclick` で該当 URL を開く）。
- デプロイ想定: 自鯖 + Cloudflare Tunnel（HTTPS 終端）。`AUTH_TRUST_HOST=true`、オリジンは localhost バインド前提。

---

## 2. 認証フロー（Symbol DID チャレンジ署名）

メール/パスワード認証は廃止。ログイン主体は **Symbol アドレス（DID）**。秘密鍵はサーバーへ送らない。

1. クライアントがローカル保存のウォレットを所持（無ければ作成/インポート）。
2. `POST /api/auth/challenge`（未認証）: アドレス形式・ネットワーク先頭文字（testnet=`T`/mainnet=`N`）を検証し、
   ワンタイム `nonce` ＋署名対象 `message`（サービス名/用途/network/address/nonce/発行・有効期限）を**サーバーで生成・保存**（`Challenge`、TTL 5分）。IP 単位レート制限（20回/10分）。
3. クライアントが秘密鍵で `message` に署名（`lib/wallet/symbol.ts signChallenge`、メモリ上のみ）。
4. `signIn("did", {challengeId, address, publicKey, signature})` → `lib/auth.ts authorize`:
   - チャレンジの存在・未使用・期限内・アドレス一致・network 一致を検証
   - 公開鍵→アドレス導出一致（`lib/did/verify.ts deriveAddressFromPublicKey`）
   - 署名検証（**保存済み message を使用**。クライアント申告 message は不使用）（`verifySignature`）
   - nonce を used 化 → ユーザー upsert（初回は `symbolAddress`/`did`/`xymAddress`/`displayName`=短縮アドレスで作成）→ `lastLoginAt`/`publicKey` 更新
   - 監査ログ（`AuthLog`: challenge_issued / did_login_success / did_login_failed / did_register）
5. セッションは **JWT 戦略・7日間**。`session.user.id` を伝播。

- 新規登録 UI（`components/auth/register-flow.tsx`）: 「新規作成（24語フレーズ表示＋バックアップ確認）」/「リカバリーフレーズ・秘密鍵で復元」。完了後ローカル暗号化保存＋自動 DID ログイン。
- ログイン UI（`components/auth/did-login.tsx`）: 保持アカウントが複数なら選択。パスワードでローカル復号→チャレンジ署名→ログイン。
- 旧メール/パスワードアカウントはログイン不可。

---

## 3. データモデル（prisma/schema.prisma 実測・全11モデル）

- **User**: `symbolAddress`(@unique, DID識別子) / `did` / `network` / `publicKey` / `lastLoginAt` / `email`(@unique,任意) / `emailVerified` / `emailNotificationsEnabled` / `passwordHash`(未使用) / `displayName` / `avatarUrl` / `bio` / `xAccount` / `websiteUrl` / `symbolNamespace` / `profileSource` / `smdSyncedAt` / `xymAddress`(受取) / `tokushoho` / `salesTerms` / `notificationsReadAt`(旧) / `notificationPrefs`(Json) / リレーション多数
- **Post**: `authorId` / `title` / `contentHTML`(Text) / `coverImage` / `published` / `tags`(String[]・GIN) / `publishAt`(予約) / `postType`("article"|"external_url") / 外部URL用(`url`/`comment`/`ogpTitle`/`ogpDescription`/`ogpImageUrl`/`ogpSiteName`/`tipsEnabled`) / `viewCount` / 有料(`paid`/`paidHtml`(Text)/`priceAmount`(Decimal)/`priceCurrency`/`sellerAddress`) / `createdAt` / `updatedAt`。索引: authorId / (published,createdAt) / tags(GIN)
- **Comment**: postId / userId / body(Text)
- **Tip**: postId / fromAddress / toAddress / amount(Decimal) / txHash(@unique) / fromUserId(任意,SetNull) / anonymous / message / **confirmed**(false=申告/true=オンチェーン確定) / jpyRate / confirmedAt
- **Reaction**: postId / userId / type(like|empathy|helpful|fun|thanks) / @@unique(postId,userId,type) / thanks(1:1任意)
- **Thanks**: reactionId(@unique,任意) / postId / sender/receiver(User,SetNull) / sender/receiverAddress / thanksType(thanks|super_thanks) / amount / currency / txHash(@unique) / status(confirmed|pending) / jpyRate
- **Purchase**: postId / buyerUserId(SetNull) / buyerAddress / sellerAddress / amount / currency / txHash(@unique) / confirmed / jpyRate / purchasedAt
- **Follow**: followerId / followingId / @@unique(followerId,followingId)
- **Bookmark**: userId / postId / @@unique(userId,postId)
- **Notification**: userId(受信者,Cascade) / type(tip_received|comment|reaction|purchase|new_post|follow) / actorId / actorName / postId / postTitle / amount / currency / read / createdAt（**FKを持たないスナップショット**）
- **Report**: postId / reporterUserId(SetNull) / reason / @@unique(postId,reporterUserId)
- **Challenge**: address / network / nonce / message / used / expiresAt（ログイン用ワンタイム）
- **AuthLog**: eventType / userId / address / ip / userAgent / detail（認証監査）

---

## 4. ページ（ルート）

| ルート | 内容 | 認証 |
|---|---|---|
| `/` | 記事一覧（公開記事・新着順・**無限スクロール**・検索 `?q=`・タグ `?tag=`・タグナビ） | 不要 |
| `/posts/[id]` | 記事詳細（本文/有料試し読み・OGPカード/**YouTube埋め込み**・投げ銭・リアクション・コメント・ブックマーク・共有・閲覧計測） | 閲覧不要 |
| `/posts/new`・`/posts/[id]/edit` | 記事作成/編集 | 要・本人のみ編集 |
| `/feed` | フォロー中ユーザー（横スクロール）＋フォロー中の新着記事 | 要 |
| `/bookmarks` | ブックマーク一覧 | 要 |
| `/notifications` | 通知フィード（開くと既読化）＋自分の記事へのリアクション/受領Thanks（Thanks送信UI） | 要 |
| `/dashboard` | マイ記事（公開/下書き/予約・編集/公開切替/削除・販売ダッシュボード） | 要 |
| `/revenue` | 収益管理（販売/投げ銭/Thanks・期間/状態フィルタ・円換算・CSV） | 要 |
| `/wallet` | ウォレット管理（**複数アカウント**・作成/復元/インポート・切替=再ログイン・削除・残高・アンロック・公開アドレス登録） | 要 |
| `/tips` | 投げ銭履歴（送/受）＋着金同期ボタン | 要 |
| `/profile` | プロフィール編集・SMD同期・**通知設定** | 要 |
| `/users/[id]` | 公開プロフィール（記事一覧・フォロー） | 不要 |
| `/login`・`/register` | DID ログイン / 新規登録 | 不要 |
| `/terms`・`/privacy` | 利用規約・プライバシーポリシー | 不要 |

---

## 5. API エンドポイント（app/api・全19）

| メソッド/パス | 認証 | 概要 |
|---|---|---|
| `GET/POST /api/auth/[...nextauth]` | — | Auth.js ハンドラ |
| `POST /api/auth/challenge` | 不要(RL:IP20/10分) | ログインチャレンジ発行（nonce+message を保存） |
| `POST /api/wallet/address` | 要 | 公開アドレスのみ保存（zod が address 以外を無視） |
| `POST /api/posts/[id]/view` | 不要 | 閲覧数加算（公開記事・著者本人除外） |
| `GET /api/posts/list` | 不要 | 一覧の追加ページ（無限スクロール・q/tag・抜粋/投げ銭集計込み） |
| `POST /api/ogp` | 要(RL:30/分) | 外部URLのOGP取得（SSRF対策・YouTubeはoEmbed+サムネ） |
| `POST /api/upload` | 要(RL:60/10分) | 画像アップロード（sharp で長辺2000pxへ縮小・再エンコード、入力上限25MB） |
| `POST /api/tips` | 要 | 投げ銭記録（**オンチェーン検証**＋送金元=ログイン本人バインド） |
| `POST /api/purchases` | 要 | 有料記事購入（オンチェーン検証＋本人バインド＋著者へ通知） |
| `POST /api/thanks` | 要 | Thanks記録（投稿者→読者・オンチェーン検証＋本人バインド） |
| `GET/POST /api/cron/poll-tips` | Bearer(CRON_SECRET) | 全著者の着金ポーリング→Tip確定＋通知 |
| `GET /api/smd`・`POST /api/smd/apply` | 取得不要/適用は要 | SMD(social_meta_data) 候補取得・本人アドレスで再取得して適用 |
| `POST /api/reports` | 要(RL:user5/h+IP10/h) | 記事通報→記録＋運営メール通知 |
| `GET /api/revenue/export` | 要 | 収益CSV（BOM・JST・取引時レート円換算・フィルタ対応） |
| `GET /api/notifications/list` | 要 | 通知一覧（ベル/ポーリング用） |
| `POST /api/notifications/read` | 要 | 既読化（ids指定 or 全件） |
| `GET/POST /api/notifications/prefs` | 要 | 通知種別ごとの設定取得/更新 |
| `GET /api/notifications/unread-count` | 要 | 未読通知数（ベルのバッジ） |

### サーバーアクション（app/**/actions.ts）
- `posts/actions.ts`: `savePost`（作成/更新・所有権・サニタイズ・販売同意・著作権確認・新規公開時フォロワー通知） / `deletePost` / `togglePublish`
- `comments/actions.ts`: `addComment`（公開記事のみ・著者へ通知） / `deleteComment`（投稿者or著者）
- `reactions/actions.ts`: `toggleReaction`（トグル・著者へ通知）
- `users/actions.ts`: `followUser`（被フォロー者へ通知） / `unfollowUser`
- `bookmarks/actions.ts`: `toggleBookmark`
- `tips/actions.ts`: `syncMyTips`（自分の着金を手動ポーリング）
- `profile/actions.ts`: `updateProfile`

---

## 6. ウォレット / 鍵管理（ノンカストディアル）

- **暗号化**（`lib/wallet/crypto.ts`）: Web Crypto のみ。PBKDF2(SHA-256, 30万回)→AES-256-GCM。保存形式 `{version,address,salt,iv,ciphertext}`。`crypto.subtle` 不在（非HTTPS等）は `WebCryptoUnavailableError` で明示。
- **鍵導出**（`lib/wallet/symbol.ts`）: symbol-hd-wallets で BIP39 24語ニーモニック生成・HD導出（path `m/44'/4343'/0'/0'/0'`）。
- **複数アカウント保持**（`lib/wallet/storage.ts`）: `localStorage["nagexym.wallets.v1"] = {active, wallets[]}`。旧単一形式から自動移行。`getStoredWallet`等はアクティブ基準。切替＝対象鍵で再ログイン（署名鍵とセッションを常に一致させる）。
- **送金**（`lib/wallet/transfer.ts`）: `TransferTransaction`＋`setMaxFee(100)`、メッセージマーカー（`nagexym:tip:` / `nagexym:buy:` / `nagexym:thanks:`）。署名・アナウンスはクライアント完結。
- **残高チェック**: 投げ銭/Thanks/購入の送信前に `checkSufficientBalance`（残高 < 額+0.1XYM で事前警告）。
- サーバーは `User.xymAddress`（公開アドレス）のみ保持。`/api/wallet/address` は zod で address 以外を破棄。

---

## 7. 送金系機能（すべてP2P・運営非預かり）

- **投げ銭**（`components/tip/tip-box.tsx`・`/api/tips`）: スライダー 0.1〜10 XYM・匿名可・著者アドレスQR。記録時にノードで検証（マーカー・宛先=著者・最低額）。金額/送金元は**オンチェーンの値**を採用。送金元が**ログインユーザーの登録アドレスと一致**を必須（横取り防止）。`confirmed` は着金ポーラーで確定。一覧/詳細に合計表示。
- **着金ポーリング**（`lib/tips/poller.ts`）: 確定送金を取得しマーカーで記事紐付け→Tip確定（冪等・P2002耐性）＋著者へ通知。手動同期(`/tips`)/cron(`/api/cron/poll-tips`)。
- **Thanks / Super Thanks**（`lib/thanks.ts`・`/api/thanks`）: 投稿者→リアクションした読者への固定額（0.39 / 3.9 XYM）。ノード検証＋本人バインド。1リアクション1回。
- **有料記事**（`components/purchase-panel.tsx`・`/api/purchases`）: 試し読み(無料`contentHTML`)＋有料`paidHtml`。購入は販売者へ直接送金→サーバーがノード検証→`Purchase`記録で全文解除。本人バインド。
- **円換算**（`lib/rates.ts`）: CoinGecko から XYM/JPY（60秒キャッシュ・`XYM_JPY_RATE_URL` で差替）。記録時レートを Tip/Purchase/Thanks に保存。
- **収益管理**（`lib/sales/query.ts`・`/revenue`・`/api/revenue/export`）: 販売/投げ銭/Thanks受領+送信を統合、期間(YYYY-MM,JST)/状態フィルタ、円換算、CSV。

---

## 8. 通知機能

- **種別と既定**（`lib/notifications.ts`）: 投げ銭ON / コメントON / いいねOFF / 購入ON / 新着OFF / フォローOFF。`User.notificationPrefs`(Json) で ON/OFF。
- **トリガー（サーバー側）**: 着金ポーラー / コメント / リアクション / 購入 / 新規公開→フォロワー / フォロー。`notify()` は受信者設定OFFなら作らず、自分宛は除外。
- **サイト内**: ヘッダーのベル未読バッジ（モバイルはヘッダー直下に常時表示）。`/notifications` で一覧＋開くと全既読化。
- **ブラウザ通知**: `public/sw.js` + `components/notification-manager.tsx`（Providers にマウント）。ログイン中45秒間隔＋フォーカス時にポーリングし、**許可済みのときのみ** `registration.showNotification`（SW ready 経由・初回は基準のみ記録・localStorage で重複抑制）。設定UI（`components/notification-settings.tsx`）で種別トグル＋許可＋テスト通知。
- 遷移先: フォロー→`/users/{actorId}`、その他→`/posts/{postId}`、無ければ `/notifications`。
- 外部サービス不使用（Web Notifications API + SW のみ）。

---

## 9. コンテンツ機能

- **記事投稿**（Tiptap・`components/post-form.tsx`）: 投稿タイプ（記事 / 外部URL共有）、カバー画像、タグ、公開/下書き、**予約投稿**(`publishAt`)、販売公開。
- **公開判定**（`lib/posts.ts livePostWhere`）: `published && (publishAt null か現在以前)`。予約未来は一般一覧/詳細から除外（メタ漏洩防止）。
- **外部URL共有**（`lib/ogp.ts`）: OGP取得でリンクカード。**YouTube** は oEmbed＋サムネ、詳細では**iframe埋め込み再生**（`lib/youtube.ts`、youtube-nocookie）。URL投稿は販売不可・投げ銭は任意・著作権確認チェック必須。
- **リアクション**（5種）＋ Thanks 連携。
- **コメント**（公開記事のみ・削除は投稿者or著者）。
- **フォロー/フィード**、**ブックマーク**、**閲覧数**（`components/view-tracker.tsx`・localStorage で同一端末重複抑制）。
- **検索/タグ**、**ページング廃止→無限スクロール**（`components/post-feed.tsx`）。
- **共有**（`components/share-buttons.tsx`）: X / Facebook / LINE / URLコピー / Web Share。
- **OGP/メタ**: 記事ごとに og/twitter カード（外部URL投稿は ogp フィールド使用）、フォールバック画像 `public/og-default.png`。
- **SMD連携**（`lib/smd.ts`）: チェーン上 `social_meta_data` から本人発行のみ・形式検証（https/画像拡張子/svg・js拒否）してプロフィール候補を適用。
- **通報**（`components/report-button.tsx`・`/api/reports`・`lib/email.ts`）: 記録＋運営メール（SMTP未設定時はログ出力）。

---

## 10. セキュリティ実装

- **鍵**: 秘密鍵/フレーズ/パスワードをサーバー送信・保存・ログ出力しない。Web Crypto のみ。
- **DID認証**: サーバー保存 message での署名検証・nonce ワンタイム・公開鍵→アドレス導出一致・監査ログ。
- **送金検証**: 投げ銭/購入/Thanks すべてノードでオンチェーン検証＋**送金元=ログイン本人**バインド（公開txHash横取り防止）。txHash unique で二重記録防止。
- **XSS**: 記事HTMLは保存時 sanitize-html（許可リスト）。`dangerouslySetInnerHTML` は `contentHTML`/`paidHtml` のみ。他はReact既定エスケープ。
- **SSRF**（`lib/ogp.ts`）: DNS解決して全解決IPのプライベート/予約帯を拒否、リダイレクト手動追従で各ホップ再検証、サイズ/時間制限。
- **レート制限**（`lib/ratelimit.ts`・インメモリ）: challenge / reports / ogp / upload。IP は `CF-Connecting-IP` 優先。
- **CSP / セキュリティヘッダ**（`next.config.ts`）、`proxy.ts` のキャッシュ再検証。
- **入力検証**: zod（`lib/validations.ts`）。DBは Prisma パラメータ化のみ（生SQLなし）。

---

## 11. 環境変数（.env.example）

`DATABASE_URL` / `NEXT_PUBLIC_SITE_URL` / `AUTH_SECRET` / `AUTH_URL`(任意・プロキシ下推奨) / `AUTH_TRUST_HOST` /
`NEXT_PUBLIC_SYMBOL_NETWORK`(testnet既定) / `NEXT_PUBLIC_SYMBOL_NODE_URL`(カンマ区切りで複数=フェイルオーバー) /
`CRON_SECRET` / `REPORT_NOTIFY_EMAIL` / `SMTP_*` / `S3_*` / `NEXT_PUBLIC_S3_PUBLIC_URL` /
`XYM_JPY_RATE_URL`(任意)。

---

## 12. 旧仕様（spec.md / CLAUDE.md）との主な相違

- **認証**: 旧「NextAuth メール認証」→ 実際は **Symbol DID チャレンジ署名認証**（メール/パスワードは廃止・`passwordHash`/`bcryptjs` は名残）。
- **フェーズ制**: spec の Phase 分割は完了済み。以後 spec 外の追加機能（有料記事・Thanks・収益管理・外部URL/YouTube・通報・フォロー/フィード・ブックマーク・通知・無限スクロール・複数アカウント等）を多数実装。
- **ページング**: 仕様の番号ページネーション→無限スクロールへ置換。
- **ミドルウェア**: `middleware.ts` ではなく `proxy.ts`（Next.js 16 規約）。
- **フォント**: `next/font/google`(Geist) を廃止しシステムフォント（ビルドの外部依存排除）。
- **ネットワーク**: 既定 testnet。メインネットは明示指示まで不可（方針継続）。
- **デプロイ**: Vercel 例に加え、自鯖 + Cloudflare Tunnel 運用を実施中。
