# セキュリティレポート（実運用公開前レビュー）

- 対象: Harbor（nageXym）アプリ本体コード
- 日付: 2026-06-15
- 範囲: 認証・認可・入力検証・XSS/SSRF・鍵の取り扱い・送金検証・ヘッダ/CSP・秘密情報管理・乱用耐性
- 補足: 依存モジュールの脆弱性は別途調査済み（`docs/` 外で報告）。本レポートは**アプリ実装**の問題に限定。

---

## 総評

ノンカストディアル設計（秘密鍵のサーバー非送信）・認可・XSS 対策・オンチェーン送金検証など、
**コアのセキュリティ設計は概ね健全**。ただし**実運用公開前に対処すべき項目が数件**ある。
特に **OGP 取得の SSRF（High）** は、クラウド環境ではメタデータ経由の認証情報漏洩につながり得るため
公開前の修正を強く推奨する。

| # | 深刻度 | 項目 | 場所 |
|---|---|---|---|
| 1 | ~~**High**~~ ✅ **修正済 (2026-06-15)** | OGP 取得の SSRF（DNS 未解決ブロックリスト・リダイレクト追従） | `lib/ogp.ts` |
| 2 | Medium | 投げ銭がオンチェーン未検証で記録（金額の偽装表示） | `app/api/tips/route.ts` |
| 3 | Medium | 購入/投げ銭が支払者本人に紐付かない（公開 txHash の横取り） | `app/api/purchases/route.ts`, `tips` |
| 4 | Medium | レート制限が全く無い（メール爆撃・DB 肥大・SSRF 増幅） | 全 API |
| 5 | Medium | CSP が `script-src 'unsafe-inline'` を許可 | `next.config.ts` |
| 6 | Low | チャレンジの used 判定が非アトミック／期限切れ未削除 | `lib/auth.ts`, challenge |
| 7 | Low | xymAddress を所有証明なしで保存可能 | `app/api/wallet/address/route.ts` |
| 8 | Low | 監査ログの IP が `X-Forwarded-For` 依存（偽装可） | `lib/audit.ts` |
| 9 | Low | cron シークレット比較が非定数時間 | `app/api/cron/poll-tips/route.ts` |

---

## High

### 1. OGP 取得の SSRF（Server-Side Request Forgery）

**場所**: `lib/ogp.ts` / 入口 `app/api/ogp/route.ts`（要ログインだが DID で誰でも自己登録可能）

**内容**: `fetchOgp()` がユーザー指定 URL をサーバーから fetch するが、保護が不十分。

- `isBlockedHost()` は**ホスト名の文字列/正規表現マッチのみ**で、**DNS 解決をしない**。
  攻撃者が `evil.example.com` の A レコードを `169.254.169.254`（クラウドメタデータ）や `10.x` 等の
  内部 IP に向ければブロックを素通りする（DNS リバインディング型）。
- `fetch(..., { redirect: "follow" })` のため、**公開 URL が `http://169.254.169.254/...` 等へ
  302 リダイレクト**すれば、リダイレクト先は `isBlockedHost` で再チェックされず到達する。
- IPv6 プライベート帯（`fc00::/7`, `fe80::`）、10進/8進/16進エンコード IP（例 `http://2130706433/` = 127.0.0.1）も未ブロック。

**影響**: クラウド上ではインスタンスメタデータ（IAM 一時認証情報）や内部サービスへの到達 → **認証情報漏洩・内部探索**。

**推奨対策**:
- `fetch` を **`redirect: "manual"`** にし、リダイレクトごとに行き先ホストを再検証（または 1 回も追従しない）。
- ホスト名を**実際に DNS 解決**し、得られた**全 IP**を `ipaddr.js` 等でプライベート/ループバック/リンクローカル/
  ユニークローカル（IPv6 含む）判定して拒否。解決した IP に直接接続して TOCTOU を避ける（pin）。
- 許可スキームを https のみに絞る運用も検討。

**対応状況（2026-06-15 修正済み）**: `lib/ogp.ts` に外部依存なし（`node:dns/promises`）で以下を実装。
- `assertPublicHost()`: ホスト名を `lookup(host,{all:true})` で**全 IP 解決**し、IPv4/IPv6 の
  プライベート・ループバック・リンクローカル(169.254 含む)・ULA・CGNAT・予約/マルチキャスト帯・
  IPv4-mapped(`::ffff:`) を判定して拒否。`localhost`/`.local`/`.internal` は DNS 前に早期拒否。
- `safeFetch()`: `redirect: "manual"` で**リダイレクトを手動追従**し、各ホップで scheme と
  `assertPublicHost()` を**再検証**（最大 4 ホップ）。これにより公開URL→内部IPへの 30x 回避を遮断。
- 判定ロジックは 15 ケース（メタデータ 169.254.169.254 / 各プライベート帯 / v4-mapped / v6 ULA・LL /
  公開 IPv4・IPv6）でユニットテスト済み。typecheck / lint OK。
- 残存リスク（Low）: DNS 解決〜接続間の厳密な rebinding TOCTOU は完全には閉じない（IP pin には
  カスタム dispatcher が必要）。現実的な攻撃難度は大幅に上昇。YouTube/SMD/レート取得は固定ホストのため対象外。

---

## Medium

### 2. 投げ銭がオンチェーン未検証のまま記録される

**場所**: `app/api/tips/route.ts`

**内容**: 購入(`/api/purchases`)・Thanks(`/api/thanks`)は `verify*ByHash` で**ノード検証**してから記録するのに対し、
投げ銭は**クライアント申告の txHash・amount をそのまま保存**（コード内コメントも「Phase 7 で追加予定」のまま）。
ログイン済みユーザーが任意の `txHash`・`amount(0.1〜10)`・`fromAddress` を送れば、
記事に**偽の投げ銭**を作れる（`confirmed=false`）。公開ページの合計/件数表示に未確定分が含まれると**金額偽装**になる。

**影響**: 資金移動は伴わないが、投げ銭額・人気の**表示の信頼性**を損なう（評判操作・スパム）。

**推奨対策**:
- 記録時に他フロー同様 `verifyTransferByHash`（marker `nagexym:tip:<postId>`・宛先=著者・額一致）で検証する、
  もしくは**公開表示は `confirmed=true` のみ**に限定する（ポーラーで確定したものだけ集計）。

### 3. 購入・投げ銭が「支払った本人」に紐付かない

**場所**: `app/api/purchases/route.ts`（および `tips`）

**内容**: txHash はオンチェーンで**公開情報**。購入検証は「宛先=販売者・marker・金額」のみ確認し、
**送金者(signer)がセッションユーザー本人であることを確認しない**（`buyerUserId` はセッション、
`buyerAddress` は tx の signer から導出）。
第三者 B がチェーンを監視して他人 A の `nagexym:buy:<postId>` tx の txHash を先に
`/api/purchases` へ送ると、**B のアカウントに購入が記録**され（txHash は unique）、後から来た A は
`409 alreadyRecorded`。結果として **A が支払い B が閲覧権を得る**横取りが成立し得る。

**影響**: 有料記事の**不正アクセス取得**／投げ銭の送信者誤帰属。

**推奨対策**:
- 検証結果の `senderAddress`（= signer）が**セッションユーザーの登録 `xymAddress` と一致**することを必須にする。
  これにより「送金元アドレスを本人が登録している」ことが横取り防止条件になる（#7 の所有証明強化と併用が望ましい）。

### 4. レート制限が存在しない

**場所**: 全 API（特に `app/api/auth/challenge`, `app/api/reports`, `app/api/ogp`, `app/api/upload`）

**内容**: スロットリング/レート制限の実装が一切ない（コード全走査で該当なし）。

- `/api/auth/challenge`: **未認証**で呼べ、1 回ごとに `Challenge` 行を作成 → **DB 肥大・書き込み増幅 DoS**。
- `/api/reports`: 1 ユーザーが多数の記事へ通報を量産でき、各々が**運営宛メールを送信** → **メール爆撃**。
- `/api/ogp`: SSRF（#1）と組み合わせた**内部スキャン増幅**。
- `/api/upload`: 25MB×多数で**ストレージ/帯域の浪費**。

**推奨対策**: IP＋ユーザー単位のレート制限（`@upstash/ratelimit` 等、または Vercel の WAF/レート制限）。
通報は「1 ユーザーあたり N 件/時」等の上限とメール集約も検討。

### 5. CSP が `script-src 'unsafe-inline'` を許可

**場所**: `next.config.ts`

**内容**: XSS 多層防御として CSP は有用だが、`script-src 'self' 'unsafe-inline'` のため
万一インライン注入が起きた場合に**スクリプト実行を防げない**（コメントにも将来課題と記載）。
現状 XSS 自体は sanitize-html で抑止されているが、防御の最後の砦が弱い。

**推奨対策**: Next.js の **nonce ベース CSP**（`'strict-dynamic'` + per-request nonce）へ移行し
`'unsafe-inline'` を除去。`img-src ... https:` も可能なら S3/YT ドメインに限定。

---

## Low / 情報

### 6. チャレンジの used 判定が非アトミック・期限切れ未掃除
- `lib/auth.ts` で `used` を確認 → 後で `update used:true`。間に並行リクエストが入る微小な競合余地。
  影響は同一ユーザーの二重ログイン程度で限定的だが、`updateMany({where:{used:false}})` の戻り件数で
  アトミックに消費する形が堅牢。
- `Challenge` の期限切れ行が削除されない（テーブル肥大）。定期削除（cron）を推奨。

### 7. xymAddress を所有証明なしで保存
- `app/api/wallet/address/route.ts` は形式検証のみで、そのアドレスを**本人が支配する証明（署名）**を求めない。
  他人/任意アドレスを自分のプロフィールに設定可能（主に自己不利益だが、#3 の横取り対策・著者宛投げ銭の
  整合性のため、登録時にチャレンジ署名で所有証明を取ることが望ましい）。

### 8. 監査ログの IP が `X-Forwarded-For` を信頼
- `lib/audit.ts requestMeta()` は先頭の XFF をそのまま採用。信頼できるプロキシ背後でないと**偽装可能**。
  Vercel など**信頼プロキシが付与する値のみ**を使う設定にする（手前のプロキシ段数を考慮）。

### 9. cron シークレット比較が非定数時間
- `app/api/cron/poll-tips` は `!==` 比較。ネットワーク越しのタイミング攻撃は非現実的だが、
  `crypto.timingSafeEqual` 使用が望ましい。

### 情報（問題なし）
- 通報メール本文にユーザー入力（理由）が入るが **text パート**であり、`to`/transport 名は env 由来のため
  ヘッダーインジェクション/コマンドインジェクションには至らない。

---

## 良好な点（維持すべき設計）

- **ノンカストディアル徹底**: 秘密鍵/ニーモニック/パスフレーズをサーバーへ送信・保存・ログ出力する箇所なし。
  鍵暗号化は Web Crypto API（PBKDF2 + AES-256-GCM）のみ。サーバーが保持するのは公開アドレスのみ。
- **DID 認証**: 署名対象メッセージ・nonce をサーバー生成/保存し、公開鍵→アドレス導出一致・署名検証・
  ネットワーク一致・有効期限を検証。クライアント申告の message は不使用。監査ログあり。
- **送金検証（購入/Thanks）**: ノードで宛先・マーカー・金額・signer を検証してから記録。txHash unique で二重記録防止。
- **認可**: 記事/コメント/フォロー等の更新系サーバーアクションで `authorId`/本人判定を一貫して実施（IDOR なし）。
  収益 CSV は `session.user.id` スコープ。投げ銭の `toAddress` はサーバーが著者から決定（クライアント申告不採用）。
- **XSS**: `dangerouslySetInnerHTML` は `contentHTML`/`paidHtml`（保存時 sanitize-html 済み）のみ。
  その他のユーザー入力（コメント・bio・OGP タイトル・特商法等）は React の既定エスケープで出力。
- **SQL**: 生 SQL なし、Prisma パラメータ化のみ。
- **その他**: セキュリティヘッダ一式（X-Frame-Options DENY 等）、`.env` は gitignore 済み・未追跡、
  リポジトリにコミットされた秘密情報なし。SMD/レート取得は固定/設定ノード宛で SSRF なし。

---

## 公開前チェックリスト（優先度順）

1. [x] **#1 SSRF 修正**（DNS 解決＋全 IP プライベート判定＋リダイレクト manual）— ✅ 2026-06-15 完了
2. [ ] **#3 支払者本人バインド**（signer == 登録 xymAddress）と **#2 投げ銭の検証/確定のみ表示**
3. [ ] **#4 レート制限**（challenge / reports / ogp / upload）と通報メールの抑制
4. [ ] **#5 nonce ベース CSP** への移行
5. [ ] #6〜#9 の堅牢化（チャレンジのアトミック消費・期限切れ掃除・アドレス所有証明・XFF/定数時間比較）
6. [ ] 本番環境変数（`AUTH_SECRET`/`CRON_SECRET` を十分強いランダム値、`SMTP_*`、S3、`NEXT_PUBLIC_SITE_URL`）
7. [ ] 依存モジュールの方針（symbol-sdk 系 major 移行の検討は別タスク）
