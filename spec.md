# Symbol XYM 投げ銭ブログサイト 仕様書

## 1. プロジェクト概要

ユーザーがブログ記事を投稿し、読者がSymbol(XYM)を使って記事に「投げ銭」できるブログサービス。
ウォレットはノンカストディアル方式とし、秘密鍵はユーザーのブラウザ内（パスフレーズで暗号化したうえでlocalStorage）にのみ保存する。サーバー側は秘密鍵を一切保持しない。

---

## 2. 技術スタック

| レイヤー | 採用技術 |
|---|---|
| フロントエンド | Next.js (App Router) + TypeScript + Tailwind CSS |
| リッチテキストエディタ | Tiptap（画像埋め込み対応） |
| 認証 | NextAuth.js（メールアドレス + パスワード、または Magic Link） |
| バックエンド | Next.js API Routes |
| DB | PostgreSQL + Prisma ORM |
| 画像ストレージ | S3互換オブジェクトストレージ（Cloudflare R2など） |
| ブロックチェーン連携 | symbol-sdk, symbol-hd-wallets |
| 暗号化（ローカル鍵保管） | Web Crypto API（AES-256-GCM） |

---

## 3. 機能要件

### 3.1 ユーザー登録・認証
- メールアドレス + パスワードで登録
- メール確認（任意：確認リンク送信）
- ログイン/ログアウト

### 3.2 プロフィール
- アイコン画像のアップロード・変更
- 表示名、自己紹介文
- X（旧Twitter）のアカウント名登録（プロフィールにリンク表示）
- XYMアドレス（公開アドレス）の表示・登録（ウォレット生成時に自動セット）

### 3.3 記事投稿・編集
- リッチテキストエディタ（見出し、リスト、リンク、画像埋め込み等）
- カバー画像設定
- 公開/非公開（下書き）切り替え
- 編集・削除（自分の記事のみ）

### 3.4 記事閲覧
- 記事一覧（新着順、ページネーション）
- 記事詳細ページ
- 著者情報表示（アイコン、表示名、Xリンク、XYMアドレス/QR）

### 3.5 コメント機能
- ログインユーザーが記事にコメント投稿
- コメント一覧表示（削除は本人または記事著者が可能）

### 3.6 投げ銭機能（XYM）
- 記事詳細ページに「投げ銭」ボタン
- 投げ銭額入力（XYM単位）
- 著者のXYMアドレス宛のトランザクション情報をQRコード生成（Symbol URIスキーム準拠）
- ユーザー自身のウォレット（後述）から送金トランザクションを作成・署名・アナウンス
- サーバー側で著者アドレス宛の着金をポーリングし、記事に紐付けて「投げ銭履歴」として表示
- 投げ銭額・送金者（任意で匿名可）・タイムスタンプを記事ページに一覧表示

### 3.7 ウォレット機能（ノンカストディアル）
- **ウォレット作成**
  - symbol-sdk + symbol-hd-walletsを用いてブラウザ上でアカウント生成
  - ニーモニックフレーズ（BIP39）を表示し、ユーザーにバックアップを促す
  - ウォレットパスフレーズ（ログインパスワードとは別）を設定
  - 秘密鍵をAES-256-GCM（Web Crypto API）でパスフレーズから導出した鍵を用いて暗号化
  - 暗号化データ（salt, iv, ciphertext）をlocalStorageに保存
  - 生成された公開アドレスをサーバーのユーザープロフィールに保存
- **ウォレットアンロック**
  - 操作時にパスフレーズ入力モーダルを表示
  - localStorageの暗号化データを復号し、秘密鍵を一時的にメモリ上に保持（永続化しない）
- **送金**
  - symbol-sdkで`TransferTransaction`を作成・署名・アナウンス
- **インポート/復元**
  - ニーモニックフレーズから別デバイスでウォレットを復元可能にする画面
- **残高表示**
  - symbol-sdkの`RepositoryFactoryHttp`で読み取り専用に取得（秘密鍵不要）

### 3.8 対象外機能（明示）
- プライベートDM機能はなし

---

## 4. データモデル（Prisma想定）

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  displayName   String
  avatarUrl     String?
  bio           String?
  xAccount      String?
  xymAddress    String?  // 公開アドレスのみ。秘密鍵は保存しない
  createdAt     DateTime @default(now())

  posts         Post[]
  comments      Comment[]
}

model Post {
  id          String   @id @default(cuid())
  authorId    String
  author      User     @relation(fields: [authorId], references: [id])
  title       String
  contentHTML String
  coverImage  String?
  published   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  comments    Comment[]
  tips        Tip[]
}

model Comment {
  id        String   @id @default(cuid())
  postId    String
  post      Post     @relation(fields: [postId], references: [id])
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  body      String
  createdAt DateTime @default(now())
}

model Tip {
  id            String   @id @default(cuid())
  postId        String
  post          Post     @relation(fields: [postId], references: [id])
  fromAddress   String
  toAddress     String
  amount        Decimal
  txHash        String   @unique
  confirmedAt   DateTime @default(now())
}
```

---

## 5. ウォレット暗号化フォーマット（localStorage）

```json
{
  "version": 1,
  "address": "公開アドレス（参考表示用）",
  "salt": "base64",
  "iv": "base64",
  "ciphertext": "base64"  // AES-256-GCMで暗号化された秘密鍵(hex)
}
```

- 鍵導出: PBKDF2（Web Crypto API `crypto.subtle.deriveKey`）
- 暗号化: AES-256-GCM
- サーバーへの送信: なし（このJSONはブラウザ内にのみ存在）

---

## 6. セキュリティ要件

- 秘密鍵・ニーモニック・ウォレットパスフレーズはいかなる形でもサーバーに送信・保存しない
- ウォレットパスフレーズはログイン用パスワードと異なるものを設定するようUIで案内
- XSS対策（リッチテキストエディタの出力サニタイズ、CSP設定）を必須とする
- ニーモニックバックアップ確認画面を必須フローとする（未確認では先に進めない）

---

## 7. 開発フェーズ分割（自律開発タスク）

| フェーズ | 内容 |
|---|---|
| Phase 1 | プロジェクト初期化、DBスキーマ、認証（ユーザー登録/ログイン） |
| Phase 2 | プロフィール編集（アイコン、X連携、表示名/bio） |
| Phase 3 | 記事投稿（Tiptapエディタ、画像アップロード、CRUD） |
| Phase 4 | 記事一覧・詳細・コメント機能 |
| Phase 5 | ウォレット生成・ニーモニックバックアップ・暗号化保存・復元 |
| Phase 6 | 投げ銭送金フロー（QR生成、署名・アナウンス） |
| Phase 7 | 投げ銭受信検知（サーバー側ポーリング）・記事への紐付け表示 |
| Phase 8 | UI/UXブラッシュアップ、デプロイ設定 |

※Phase 5・6は秘密鍵を直接扱うため、実装後に人間によるコードレビューを必須とする。

---

## 8. テスト環境

- Symbolテストネットを使用（Faucetでテスト用XYM取得）
- メインネット切り替えは最終フェーズで対応
