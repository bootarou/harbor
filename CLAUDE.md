# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業する際の指針です。
実装前に必ず `/docs/current-spec.md` を読み、現状の実装を正として作業してください。
`/docs/spec.md` は初期仕様書であり、現状と乖離しています。`current-spec.md` を優先してください。

---

## プロジェクト概要

**Harbor**（リポジトリ名: nageXym）
Symbol(XYM) 投げ銭機能付きノンカストディアル・ブログサイト。
秘密鍵はブラウザ内でのみ暗号化保存し、サーバーには公開アドレスのみを保持する。

---

## 技術スタック（厳守）

- Next.js 16（App Router / Turbopack）+ React 19 + TypeScript
- Tailwind CSS v4（システムフォント使用、`next/font/google` は使わない）
- Auth.js v5（next-auth ^5 beta）— Credentials プロバイダ、Symbol DID 署名認証
- PostgreSQL + Prisma 7（`@prisma/adapter-pg`）
- symbol-sdk 2.0.7 / symbol-hd-wallets 0.14.2（WebAssembly使用）
- Web Crypto API（PBKDF2 + AES-256-GCM、ローカル鍵暗号化のみ）
- Tiptap v3（リッチテキストエディタ）
- sanitize-html（XSSサニタイズ）、sharp（画像リサイズ）、zod（入力検証）
- 画像: S3互換ストレージ（未設定時は `public/uploads/` フォールバック）
- ミドルウェア: `proxy.ts`（Next.js 16規約、`middleware.ts` ではない）

別のライブラリ・フレームワークへの変更は**提案のみ**とし、無断で変更しない。
`bcryptjs` / `passwordHash` は名残であり、新たに使用しない。

---

## 認証（Symbol DID チャレンジ署名）

メール/パスワード認証は廃止済み。以下のフローを厳守する。

1. `POST /api/auth/challenge` でサーバーがノンス＋メッセージを生成・保存（TTL 5分）
2. クライアントが秘密鍵で message に署名（メモリ上のみ、サーバー送信しない）
3. `signIn("did", {challengeId, address, publicKey, signature})` で Auth.js が署名検証
4. 検証OK → ユーザー upsert → JWT セッション（7日間）

**絶対に追加してはいけないもの:**
- メール/パスワード認証の復活
- 秘密鍵・ニーモニック・パスフレーズのサーバー送信・保存・ログ出力

---

## セキュリティ（最重要・絶対に守る）

### 鍵管理
- 秘密鍵・ニーモニックフレーズ・ウォレットパスフレーズを**いかなる形でもサーバーに送らない**
- サーバーに保存してよいのは `User.xymAddress`（公開アドレス）のみ
- `/api/wallet/address` は zod で address 以外を破棄する実装を維持する
- 暗号化は Web Crypto API（`crypto.subtle`）のみ使用（独自実装・外部ライブラリ禁止）

### 送金検証（横取り防止）
- 投げ銭・購入・Thanks はすべて**ノードでオンチェーン検証**を行う
- 送金元アドレス = ログインユーザーの登録アドレス の一致確認を必ず行う
- `txHash` の unique 制約による二重記録防止を維持する

### XSS・入力検証
- 記事HTML保存時は sanitize-html（許可リスト方式）でサニタイズ
- `dangerouslySetInnerHTML` は `contentHTML` / `paidHtml` のみ許可
- すべての入力は zod で検証、DBアクセスは Prisma パラメータ化のみ（生SQL禁止）

### SSRF対策
- `lib/ogp.ts` のSSRF対策（DNS解決・プライベートIP拒否・リダイレクト再検証）を維持する

### ウォレットアンロックUI（実装予定）
- 送金時のウォレットアンロックはPINコード（6桁）またはパターンロックで行う
- PC（768px以上）: PINコード入力UI
- スマホ（768px未満）: パターンロックUI（Canvas実装、外部ライブラリ不要）
- 5回連続ミスで60秒ロック
- ウォレット初回作成・インポート時のみパスフレーズ（長文）を使用

---

## 実装済み機能（触る際は既存設計を維持）

- DID認証・複数ウォレットアカウント管理（`lib/wallet/storage.ts`）
- 記事投稿（Tiptap・予約投稿・外部URL共有・YouTube埋め込み）
- 有料記事（試し読み＋購入でフルコンテンツ解除）
- 投げ銭・Thanks / Super Thanks・着金ポーリング（cron）
- 収益管理・CSV出力・円換算（CoinGecko）
- リアクション5種・コメント・フォロー/フィード・ブックマーク
- 通知（サイト内ベル＋ブラウザ通知、外部サービス不使用）
- 通報（記録＋運営メール）
- SMD連携（チェーン上のsocial_meta_dataからプロフィール適用）
- 無限スクロール・検索・タグ・閲覧数計測

---

## 通知機能（設計方針）

- Web Notifications API + Service Worker（`public/sw.js`）のみ使用
- Firebase / Pusher / OneSignal 等の外部サービスは使用しない
- 通知許可はユーザーが明示的に許可した場合のみ発火
- ユーザーは種類ごとにON/OFF設定可能（`User.notificationPrefs` Json）

| 種類 | デフォルト |
|---|---|
| 投げ銭を受け取った | ON |
| コメントがついた | ON |
| いいねされた | OFF |
| 記事が売れた | ON |
| フォロー中の著者が新記事を投稿した | OFF |
| フォロワーが増えた | OFF |

---

## トップページ（実装予定）

サムネなし・小さめカードのテキスト中心レイアウト。以下のセクション構成：

| セクション | 内容 |
|---|---|
| 投げ銭ランキング（今週） | タイトル／著者／XYM合計額 |
| アクセスランキング（デイリー） | タイトル／著者／PV数／いいね数 |
| 注目記事（過去7日） | いいね＋投げ銭の複合スコア順、急上昇バッジ |
| 新着記事 | タイトル／著者／投稿時刻 |
| 最近の投げ銭ティッカー | 「○○さんが『記事名』に XX XYM を投げ銭」フィード |

---

## コーディング規約

- TypeScript: `any` 禁止、厳格な型定義
- ファイル構成: Next.js App Router規約（`app/`, `app/api/`）
- コンポーネントは機能単位で `components/` 以下に配置
- DBアクセスは Prisma のみ（生SQL禁止）
- 環境変数は `.env.example` に必ず追加（実際の値は `.env`、コミットしない）
- レート制限（`lib/ratelimit.ts`）: インメモリ実装、IP は `CF-Connecting-IP` 優先

---

## Symbol SDK 利用規則

- ネットワークは環境変数 `NEXT_PUBLIC_SYMBOL_NETWORK`（既定: testnet）で切り替え
- ノードURLは `NEXT_PUBLIC_SYMBOL_NODE_URL`（カンマ区切りでフェイルオーバー対応）
- **メインネット接続は明示的指示があるまで行わない**
- 署名・送金処理はすべてクライアントサイドで完結させる
- トランザクションメッセージマーカー（`nagexym:tip:` / `nagexym:buy:` / `nagexym:thanks:`）を維持する

---

## Node.js バージョン

- Node.js 22 LTS 以上を使用
- Node 18 は EOL済み（2025年4月）のため使用しない

---

## 禁止事項まとめ

- 秘密鍵・ニーモニック・パスフレーズのサーバー送信・保存・ログ出力
- メール/パスワード認証の復活・`bcryptjs` の新規使用
- 独自暗号アルゴリズムの実装・外部暗号ライブラリの追加
- 送金検証（オンチェーン確認・本人バインド・txHashユニーク）の省略・弱体化
- `dangerouslySetInnerHTML` をサニタイズなしで使用
- 生SQLの使用
- 外部プッシュ通知サービスの導入
- メインネットへの接続（明示的指示があるまで）
- ウォレット関連機能実装後の無断 commit/push（diff提示・人間レビュー必須）

---

## 参照ドキュメント

- `/docs/current-spec.md`: **現状の正仕様書**（コードベースから逆引き生成）
- `/docs/progress.md`: 進捗管理（フェーズ完了ごとに追記）
- `/docs/spec.md`: 初期仕様書（参考のみ・現状と乖離あり）