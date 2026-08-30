# 音声スペース（LiveKit）セットアップマニュアル

コミュニティの各チャットルーム（`/community/[topicId]`）に音声スペースを追加する機能の
構築手順です。参加すると既定は**聴講者**で、「発言する」を押すと**最大5人**までのスピーカー枠を
取得してマイクが有効になります。

この機能は **`LIVEKIT_*` を設定したときだけ有効**になります。未設定の環境ではパネルごと
表示されないため、音声を使わない運用なら何も設定する必要はありません。

---

## 目次

- [1. 全体像](#1-全体像)
- [2. なぜ Cloudflare Tunnel を使えないのか](#2-なぜ-cloudflare-tunnel-を使えないのか)
- [3. 事前に必要なもの](#3-事前に必要なもの)
- [4. セットアップ手順](#4-セットアップ手順)
- [5. ローカル環境での単独テスト](#5-ローカル環境での単独テスト)
- [6. 単一環境だけで使う場合](#6-単一環境だけで使う場合)
- [7. 設定リファレンス](#7-設定リファレンス)
- [8. トラブルシューティング](#8-トラブルシューティング)
- [9. 運用メモ](#9-運用メモ)

---

## 1. 全体像

通信は**2系統**に分かれます。ここを押さえるとトラブル時の切り分けが速くなります。

```
                    ┌─────────────────────────────────────────────┐
                    │ ① シグナリング（誰がどのルームにいるかの制御）│
  ブラウザ ─────────┤   wss:// → 443/TCP → caddy → livekit-*:7880 │
      │             │   TLS 証明書が必要                           │
      │             └─────────────────────────────────────────────┘
      │
      │             ┌─────────────────────────────────────────────┐
      └─────────────┤ ② 音声メディア（実際の声）                   │
                    │   UDP 50000-50100 等 → 自鯖のグローバルIPへ直接│
                    │   WebRTC が DTLS-SRTP で暗号化               │
                    │   → 証明書もドメインも不要                    │
                    └─────────────────────────────────────────────┘
```

**443 は testnet / mainnet で共有できます。** Caddy がホスト名（SNI）で
`livekit-main` と `livekit-test` に振り分けるため、Cloudflare Tunnel のように
ポートを分ける必要はありません。

分ける必要があるのは次の4点だけです。

| | mainnet | testnet |
|---|---|---|
| サブドメイン | `livekit.example.com` | `livekit-test.example.com` |
| UDP レンジ | 50000-50100 | 50200-50300 |
| TCP フォールバック | 7881 | 7882 |
| API 鍵 | `*_MAIN` | `*_TEST` |

### コンテナ構成

testnet 版 / mainnet 版のアプリが別々の compose プロジェクトで動いているため、
音声スタックは**独立した3つ目のプロジェクト**として切り出しています。
各アプリの compose に Caddy を置くと 80/443 を取り合ってしまうためです。

```
[harbor-voice]  caddy(80,443) + livekit-main + livekit-test
                        ↑  harbor-voice ネットワーク  ↑
[harbor-main]   app ────┘                             │
[harbor-test]   app ──────────────────────────────────┘
```

アプリは `harbor-voice` ネットワークに参加し、`http://livekit-main:7880` のように
**コンテナ名で LiveKit の管理 API を叩きます**（発言権の付与・参加者一覧の取得）。
これによって自鯖のグローバル IP へ出て戻る「ヘアピン NAT」を回避しています。

---

## 2. なぜ Cloudflare Tunnel を使えないのか

**音声メディアが UDP だからです。** Cloudflare Tunnel は HTTP(S) を運ぶもので、
WebRTC が使う UDP を通せません。したがって LiveKit は
**ルーターでポートを開けて、グローバル IP へ直接届かせる**必要があります。

ここから2つの制約が出てきます。

**① 生の IP アドレスは使えません**

サイトを HTTPS で配信している以上、ブラウザの mixed content 制限により
`ws://` では接続できず `wss://` が必須です。ところが**公的な認証局は IP アドレスに
証明書を発行しません**。そのためホスト名が必要になります。

**② Cloudflare は「DNS only（グレー雲）」にします**

サブドメイン自体は Cloudflare の DNS を使いますが、**プロキシ（オレンジ雲）は通しません**。
オレンジ雲のままだと Let's Encrypt の証明書取得も WebSocket も Cloudflare を
経由してしまい、UDP は当然通りません。

---

## 3. 事前に必要なもの

- 自鯖のグローバル IP（固定 or DDNS）
- Cloudflare などで管理しているドメイン
- ルーター/ファイアウォールの設定権限（ポート開放のため）
- Docker / Docker Compose

---

## 4. セットアップ手順

### Step 1. DNS レコードを作る

Cloudflare のダッシュボードで、音声用のサブドメインを **A レコード**で追加します。

| Type | Name | Content | Proxy status |
|---|---|---|---|
| A | `livekit` | 自鯖のグローバル IP | **DNS only（グレー雲）** |
| A | `livekit-test` | 自鯖のグローバル IP | **DNS only（グレー雲）** |

> **重要**: 必ず**グレー雲**にしてください。オレンジ雲（Proxied）のままだと繋がりません。

反映を確認します。表示される IP が自鯖のグローバル IP と一致していれば OK です。

```bash
dig +short livekit.example.com
dig +short livekit-test.example.com
```

Cloudflare の IP（`104.x` や `172.67.x` など）が返る場合は、まだオレンジ雲のままです。

### Step 2. ルーターでポートを開放する

自鯖のローカル IP 宛に、以下を転送します。

| ポート | プロトコル | 用途 |
|---|---|---|
| 80 | TCP | Let's Encrypt の証明書取得（ACME チャレンジ） |
| 443 | TCP | wss:// シグナリング（**両環境で共有**） |
| 7881 | TCP | mainnet のフォールバック（UDP が塞がれた利用者向け） |
| 7882 | TCP | testnet のフォールバック |
| 50000-50100 | **UDP** | mainnet の音声メディア |
| 50200-50300 | **UDP** | testnet の音声メディア |

> **注意**: ホストの 80/443 が空いている必要があります。Cloudflare Tunnel
> （cloudflared）は外向きの接続なので 80/443 は占有しませんが、他に Web サーバーが
> 動いていないか確認してください。

### Step 3. API 鍵を生成する

**環境ごとに必ず別の値**にします。鍵を分けておくことで、片方が漏洩しても
もう片方の音声ルームには入れません。

```bash
# 4回実行して、それぞれの値を控える
openssl rand -hex 16   # KEY 用（2つ）
openssl rand -hex 32   # SECRET 用（2つ）
```

### Step 4. 音声スタックの設定ファイルを作る

```bash
cp .env.voice.example .env.voice
```

`.env.voice` を編集します。

```bash
LIVEKIT_DOMAIN_MAIN=livekit.example.com
LIVEKIT_DOMAIN_TEST=livekit-test.example.com

LIVEKIT_API_KEY_MAIN=＜Step3で生成したKEY①＞
LIVEKIT_API_SECRET_MAIN=＜Step3で生成したSECRET①＞
LIVEKIT_API_KEY_TEST=＜Step3で生成したKEY②＞
LIVEKIT_API_SECRET_TEST=＜Step3で生成したSECRET②＞
```

> `.env.voice` は `.gitignore` 済みです（実鍵を含むため追跡されません）。

### Step 5. 音声スタックを起動する

**アプリより先に起動してください。** アプリが参加する `harbor-voice` ネットワークを
このプロジェクトが作成するためです。

```bash
docker compose -f docker-compose.voice.yml --env-file .env.voice -p harbor-voice up -d
```

証明書の取得を確認します。

```bash
docker compose -p harbor-voice logs caddy | grep -i "certificate obtained"
```

2つのドメイン分（`livekit.example.com` / `livekit-test.example.com`）出ていれば成功です。
出ない場合は [トラブルシューティング](#証明書が取得できない) を参照してください。

### Step 6. 各環境のアプリ設定を書く

**mainnet 環境の `.env`**

```bash
LIVEKIT_API_KEY=＜LIVEKIT_API_KEY_MAIN と同じ値＞
LIVEKIT_API_SECRET=＜LIVEKIT_API_SECRET_MAIN と同じ値＞
LIVEKIT_WS_URL=wss://livekit.example.com
LIVEKIT_API_URL=http://livekit-main:7880
```

**testnet 環境の `.env`**

```bash
LIVEKIT_API_KEY=＜LIVEKIT_API_KEY_TEST と同じ値＞
LIVEKIT_API_SECRET=＜LIVEKIT_API_SECRET_TEST と同じ値＞
LIVEKIT_WS_URL=wss://livekit-test.example.com
LIVEKIT_API_URL=http://livekit-test:7880
```

> `LIVEKIT_WS_URL` にポート番号は不要です（Caddy が 443 で終端するため）。
>
> これらはすべて**サーバー側の変数**（`NEXT_PUBLIC_` が付かない）なので、
> **変更しても再ビルドは不要**です。コンテナの再起動だけで反映されます。

### Step 7. アプリを起動する

音声を使う環境では、`docker-compose.voice-app.yml` を `-f` で重ねます。
これがアプリを `harbor-voice` ネットワークに参加させるオーバーレイです。

```bash
# mainnet
docker compose -f docker-compose.yml -f docker-compose.voice-app.yml \
  -p harbor-main up -d

# testnet
docker compose -f docker-compose.yml -f docker-compose.voice-app.yml \
  -p harbor-test up -d
```

> オーバーレイを重ねずに素の `docker compose up -d` で起動すれば、
> 従来どおり**音声なし**で動きます。

### Step 8. 動作確認

1. `/community` で適当なトピックを開く
2. 上部に「🎙 音声スペース」パネルが出ていることを確認（**出ない場合は環境変数が未設定**）
3. 「参加する」→ 「参加中: 1人」に変われば**シグナリング（①）は成功**
4. 「🎙 発言する」→ ブラウザのマイク許可を承認 → 自分のチップが 🔊 になる
5. **別の端末・別回線**（スマホの 4G/5G など）から同じトピックを開いて参加し、
   声が聞こえるか確認 → 聞こえれば**メディア（②）も成功**

> 手順5は必ず**別回線**で試してください。同じ LAN 内だと UDP がルーターを
> 経由しないため、ポート開放の不備に気づけません。

---

## 5. ローカル環境での単独テスト

**開発 PC 1台だけで動作確認できます。** ローカルはサイトが `http://localhost` で配信され、
mixed content 制限の対象外なので **`ws://` がそのまま使えます**。したがって
**Caddy も DNS も証明書も、ルーターのポート開放も不要**です。

> `localhost` はブラウザが「セキュアコンテキスト」として扱うため、HTTP でも
> マイク（`getUserMedia`）が使えます。ただし **`http://192.168.x.x` では使えません**
> （セキュアコンテキストと見なされないため）。スマホからの実機確認は
> HTTPS 環境が必要です。

### Step 1. LiveKit をローカルで起動する

設定ファイルなしで、コンテナ1つだけで動きます。UDP も**1ポートに多重化**するので
レンジ開放は不要です。

```bash
docker run -d --name harbor-livekit-local \
  -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  -e LIVEKIT_KEYS="devkey: devsecret_local_only_at_least_32_chars" \
  livekit/livekit-server:latest --dev --node-ip 127.0.0.1 --udp-port 7882
```

| ポート | 用途 |
|---|---|
| 7880/TCP | シグナリング（`ws://` で直接続。ローカルは Caddy 不要） |
| 7881/TCP | UDP が通らないときのフォールバック |
| 7882/UDP | 音声メディア（`--udp-port` で1ポートに多重化） |

起動を確認します。

```bash
docker logs harbor-livekit-local | grep "starting LiveKit server"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7880/   # → 200
```

> `--dev` はログレベルを debug にするだけで、**鍵は自動設定されません**。
> 上記のように `LIVEKIT_KEYS` で明示的に渡してください（`キー: シークレット` 形式）。
> シークレットは32文字以上にします。

### Step 2. `.env` に4行足す

ローカル用の値です。**この鍵はローカル専用**なので、本番の鍵とは別物にしてください。

```bash
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret_local_only_at_least_32_chars
LIVEKIT_WS_URL=ws://localhost:7880
LIVEKIT_API_URL=http://localhost:7880
```

ローカルでは LiveKit がホストのポートに直接出ているので、`LIVEKIT_API_URL` は
`http://localhost:7880` でかまいません（コンテナ名は使いません）。

### Step 3. 開発サーバーを起動する

```bash
npm run dev
```

### Step 4. 確認する

1. ログインし、`/community/new` でトピックを作る（未作成の場合）
2. そのトピックを開き、上部に「🎙 音声スペース」パネルが出ることを確認
3. 「参加する」→「参加中: 1人」になれば**シグナリング成功**
4. 「🎙 発言する」→ マイク許可を承認 → 自分のチップが 🔊 になり、
   声を出すと**枠が緑に光る**（発言中アニメーション）

ここまで確認できれば、トークン発行・発言権付与・マイク publish の
一連の流れが動いています。

### Step 5.（任意）2人での通話を確認する

音声が実際に相手へ届くかまで確認したい場合は、**同じ PC の2つのブラウザプロファイル**を
使います。どちらも `localhost` なのでマイクが使え、実際に声のやり取りができます。

- 通常ウィンドウ … アカウントA
- **シークレット/プライベートウィンドウ**（または別ブラウザ）… アカウントB

> **注意**: 参加者の identity は `User.id` です。**同じアカウントで2つ開くと
> 後から接続したほうが優先され、先のセッションが切断されます**。必ず別アカウントで
> ログインしてください（DID 認証なのでウォレットも別のものが必要です）。

### 後片付け

```bash
docker rm -f harbor-livekit-local
```

`.env` に足した `LIVEKIT_*` の4行も、使わないなら空にするか削除してください
（`LIVEKIT_WS_URL` を空にすれば音声スペースは非表示に戻ります）。

### ローカルで詰まったときは

- **パネルが出ない** → `.env` の3つ（KEY / SECRET / WS_URL）が揃っているか確認し、
  **dev サーバーを再起動**する
- **接続できない** → `docker ps` で `harbor-livekit-local` が動いているか、
  `curl http://localhost:7880/` が 200 を返すか確認
- **参加はできるが声が届かない** → UDP 7882 が塞がれている可能性。
  LiveKit は TCP 7881 へフォールバックするので、7881 も公開しているか確認
- **WSL2 で音声が不安定** → Windows のブラウザから WSL2 内の Docker へ UDP を
  転送する経路になるため、環境によっては不安定です。その場合は TCP フォールバック
  （7881）が使われます

---

## 6. 単一環境だけで使う場合

testnet または mainnet の片方だけで使う場合は、不要なほうを削るだけです。

1. `docker-compose.voice.yml` から `livekit-test` サービスを削除
2. `Caddyfile` からテストネットのブロックを削除
3. `livekit.testnet.yaml` は不要
4. `.env.voice` の `*_TEST` 変数は不要
5. 開放するポートは `80` `443` `7881`/TCP と `50000-50100`/UDP のみ

---

## 7. 設定リファレンス

### 音声スタック側（`.env.voice`）

| 変数 | 必須 | 説明 |
|---|---|---|
| `LIVEKIT_DOMAIN_MAIN` | ○ | mainnet 用サブドメイン（証明書取得に使う） |
| `LIVEKIT_DOMAIN_TEST` | ○ | testnet 用サブドメイン |
| `LIVEKIT_API_KEY_MAIN` / `_SECRET_MAIN` | ○ | mainnet 用の鍵。未設定なら起動時にエラーで停止 |
| `LIVEKIT_API_KEY_TEST` / `_SECRET_TEST` | ○ | testnet 用の鍵 |

### アプリ側（各環境の `.env`）

| 変数 | 必須 | 説明 |
|---|---|---|
| `LIVEKIT_API_KEY` | ○ | この環境に対応する鍵。`.env.voice` の値と一致させる |
| `LIVEKIT_API_SECRET` | ○ | 同上 |
| `LIVEKIT_WS_URL` | ○ | ブラウザが繋ぐ公開 URL（例 `wss://livekit.example.com`） |
| `LIVEKIT_API_URL` | 任意※ | 管理 API の接続先。省略時は `LIVEKIT_WS_URL` から導出 |

※ コードとしては省略可能ですが、**この構成では実質必須**です。省略すると公開 URL 経由に
なり、自鯖から自分のグローバル IP へ出て戻るヘアピン NAT が必要になって失敗しがちです。

上3つが揃ったときだけ音声スペースが有効になります（1つでも欠けると UI ごと非表示）。

### ポート一覧

| ポート | 開放 | 用途 |
|---|---|---|
| 80/TCP | 必要 | ACME チャレンジ |
| 443/TCP | 必要 | wss シグナリング（両環境共有） |
| 7881/TCP | 必要 | mainnet フォールバック |
| 7882/TCP | 必要 | testnet フォールバック |
| 50000-50100/UDP | 必要 | mainnet メディア |
| 50200-50300/UDP | 必要 | testnet メディア |
| 7880/TCP | **不要** | Caddy が内部ネットワーク経由で中継するためホストに公開していない |

> **7880 を開放してはいけません。** 平文 ws で直接接続されると参加トークンが
> 平文で流れます。

---

## 8. トラブルシューティング

切り分けの基本は「**①シグナリングと②メディアのどちらで失敗しているか**」です。
パネルに「参加中: N人」が表示されれば①は成功しており、そこから先の
「声が聞こえない」は②の問題です。

### 音声スペースのパネル自体が表示されない

`LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_WS_URL` のいずれかが未設定です。

```bash
docker compose -p harbor-main exec app env | grep LIVEKIT
```

3つとも値が入っているか確認し、足りなければ `.env` を直して再起動します。

### 「音声スペースに接続できませんでした」と出る

①シグナリングの失敗です。ブラウザの開発者ツール（Console / Network）を開いて
エラー内容を確認してください。

- **`Mixed Content` エラー** → `LIVEKIT_WS_URL` が `ws://` になっています。`wss://` にしてください
- **`Content Security Policy` エラー** → `LIVEKIT_WS_URL` が CSP に反映されていません。
  この値は `next.config.ts` がサーバー起動時に読むため、**アプリの再起動**が必要です
  （再ビルドは不要）
- **証明書エラー** → Step 5 の証明書取得に失敗しています（下記参照）
- **タイムアウト** → 443 が開いていない、またはドメインがオレンジ雲のままです

外部からの到達性はこう確認できます。

```bash
curl -I https://livekit.example.com
```

### 証明書が取得できない

```bash
docker compose -p harbor-voice logs caddy | tail -50
```

よくある原因は3つです。

1. **ドメインがオレンジ雲のまま** → グレー雲（DNS only）に変更する
2. **80/TCP が開いていない** → ACME の HTTP-01 チャレンジに必要
3. **DNS がまだ反映されていない** → `dig +short` で自鯖の IP が返るか確認

Let's Encrypt には発行レート制限があるため、失敗を繰り返した場合は
原因を直してから時間を空けて再試行してください。

### 参加はできるが声が聞こえない

②メディアの失敗です。**UDP ポートが開いていない**可能性が高いです。

```bash
docker compose -p harbor-voice logs livekit-main | tail -30
```

同一 LAN 内では成功して外部から失敗する場合、ほぼ確実にルーターの UDP 転送設定が
原因です。`50000-50100/UDP`（testnet は `50200-50300/UDP`）を確認してください。

> **注意**: docker のポートマッピングで UDP レンジを付け替えることは**できません**。
> LiveKit は ICE candidate に「自分が実際に listen しているポート番号」を書いて
> ブラウザへ広告するため、`50200-50300:50000-50100/udp` のような付け替えをすると
> ブラウザは開いていないポートへ接続しにいって失敗します。レンジを変えたい場合は
> `livekit.*.yaml` の `port_range_start` / `port_range_end` 自体を書き換えてください。

### 「発言する」を押してもマイクが有効にならない

- **ブラウザがマイク許可を求めてこない** → サイトが HTTPS で配信されているか、
  ブラウザの設定でマイクがブロックされていないか確認
- **「マイクを使用できませんでした」** → OS/ブラウザのマイク権限を確認。
  この場合は発言権を自動的に返却するので、枠は空いたままになります
- **「発言権の反映に時間がかかっています」** → アプリから LiveKit への管理 API が
  届いていません。`LIVEKIT_API_URL` と、アプリが `harbor-voice` ネットワークに
  参加しているかを確認してください（下記）

### 発言権の付与が失敗する / 参加者数がおかしい

アプリから LiveKit への疎通を確認します。

```bash
docker compose -p harbor-main exec app wget -qO- http://livekit-main:7880 || \
  echo "→ livekit-main に到達できていません"
```

到達できない場合は、`docker-compose.voice-app.yml` を `-f` で重ねずに起動している
可能性が高いです。Step 7 のコマンドで起動し直してください。

```bash
# app が harbor-voice に参加しているか確認
docker inspect harbor-main-app-1 --format '{{json .NetworkSettings.Networks}}' | tr ',' '\n' | grep -i voice
```

### 「スピーカーが満員です」と出る

仕様どおりの挙動です。同時に発言できるのは**5人まで**で、上限に達すると
ボタンがグレーアウトします。誰かが「聴講に戻る」か退出すれば枠が空きます。

---

## 9. 運用メモ

### セキュリティ上の設計

- **参加トークンはサーバーが発行**します。identity は `User.id` で、既定は
  `canPublish: false`（聴講者）。発言権はサーバー経由でしか取得できません
- **発言できるのはマイクのみ**です（`canPublishSources` をマイクに限定しているため、
  カメラや画面共有は使えません）
- **他人の発言権は操作できません**。発言権 API は常に「自分自身」だけを対象にします
- **参加者 metadata には公開情報のみ**（表示名・アイコン・受取アドレス）を載せています。
  秘密鍵やセッション情報は一切含みません
- トークンの有効期間は 2 時間、トークン発行のレート制限は 30 回/10分/ユーザーです

### 環境を分けている理由

`LIVEKIT_API_SECRET` を共有すると、片方が漏洩したときにもう片方の音声ルームにも
入れてしまいます。音声は記録が残らないため盗聴されても気づけません。
そのため鍵・ドメイン・ポートをすべて環境ごとに分離しています。

### redis を置いていない理由

LiveKit の redis は**複数ノードを束ねるときのノード間調整**に使うもので、
単一ノードでは不要です。ここでは環境ごとに独立した単一ノードのため置いていません。
将来ノードを増やす場合は追加してください。

### スケールについて

現状は**単一サーバー前提**です。スピーカー枠の上限チェックはアプリのメモリ上で
直列化しているため、アプリを複数台に増やすと上限を超えて発言権が付与され得ます。
これは既存の[レート制限](lib/ratelimit.ts)や[オンライン表示](lib/community/presence.ts)と
同じ制約で、スケールアウトする際は3つまとめて外部ストア（Redis 等）へ
移す必要があります。

### 設定を変更したとき

`LIVEKIT_*` はすべてサーバー側の変数なので、**再ビルドは不要**です。

```bash
# アプリ側の設定を変えた場合
docker compose -f docker-compose.yml -f docker-compose.voice-app.yml \
  -p harbor-main up -d

# 音声スタック側（ドメイン・鍵・ポート）を変えた場合
docker compose -f docker-compose.voice.yml --env-file .env.voice -p harbor-voice up -d
```

鍵を変更した場合は、`.env.voice` と各環境の `.env` の**両方**を合わせて更新してください。
