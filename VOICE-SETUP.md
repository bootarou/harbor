# harborTalk（LiveKit）セットアップマニュアル

コミュニティの各チャットルーム（`/community/[topicId]`）に音声で会話できる
「harborTalk」を追加する機能の構築手順です。UI はチャット入力バーの**上の段**に
常時表示され、未参加でも「いま誰がいるか」が見えます。参加すると既定は**聴講者**
（聴くだけ）で、「🎙 発言」を押したときだけ**最大5人**までの発言枠を取得して
マイクが有効になります。トピック一覧 `/community` には、ライブ中のトピックに
バッジが付き上位に並びます。

この機能は **`LIVEKIT_*` を設定したときだけ有効**になります。未設定の環境では
行ごと表示されないため、使わない運用なら何も設定する必要はありません。

---

## 目次

- [1. 全体像](#1-全体像)
- [2. 通信経路の考え方](#2-通信経路の考え方)
- [3. 事前に必要なもの](#3-事前に必要なもの)
- [4. セットアップ手順](#4-セットアップ手順)
- [5. ローカル環境での単独テスト](#5-ローカル環境での単独テスト)
- [6. 単一環境だけで使う場合](#6-単一環境だけで使う場合)
- [7. 設定リファレンス](#7-設定リファレンス)
- [8. トラブルシューティング](#8-トラブルシューティング)
- [9. 運用メモ](#9-運用メモ)

---

## 1. 全体像

通信は**2系統**に分かれ、**通る経路がまったく違います**。ここを押さえると
設定もトラブル時の切り分けも一気に楽になります。

```
                          Cloudflare
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        Harbor Web/API   LiveKit MAIN     LiveKit TEST
          (既存Tunnel)     signaling        signaling
                              │                │
                        Cloudflare        Cloudflare
                          Tunnel            Tunnel
                              ▼                ▼
                      localhost:7880    localhost:7883

  ① シグナリング（誰がどの部屋にいるかの制御・WSS）
     → Cloudflare Tunnel を通る。ポート開放も証明書も不要。

  ② 音声メディア（実際の声・WebRTC）
     → Cloudflare Tunnel を通れない（UDP のため）。サーバーへ直接。

  Browser ──┬── UDP 50000 / TCP 7881 ──→ LiveKit MAIN
            └── UDP 50001 / TCP 7882 ──→ LiveKit TEST

     LAN 内から     → サーバーの LAN アドレス（例 192.168.0.x）
     インターネットから → サーバーのグローバルIP
```

**Internet へ公開するのはメディアだけです。**

| | Internet へ公開 | 経路 |
|---|---|---|
| シグナリング 7880 / 7883 | **しない** | Cloudflare Tunnel からのみ |
| メディア UDP 50000 / 50001 | する | サーバーへ直接 |
| TCP フォールバック 7881 / 7882 | する | サーバーへ直接 |
| 80 / 443 | **LiveKit のためには不要** | — |

TLS 終端は Cloudflare Edge が担当するため、リバースプロキシ（Caddy 等）も
Let's Encrypt の証明書取得も**必要ありません**。

### LiveKit は host ネットワークで動かします

LiveKit の2コンテナは **`network_mode: host`** で起動します（LiveKit 公式が本番で
推奨している方式）。Docker の bridge と NAT を経由しないため、
**サーバーの LAN アドレスとグローバルIPの両方**を ICE candidate に載せられます。

`advertise_internal_ip: true` と併せることで、**LAN 内の PC からも外部の
スマートフォンからも**同じルームに繋がります。

> 詳しい経緯は[なぜ host ネットワークなのか](#なぜ-host-ネットワークなのか)を参照。

### ポート割り当て（環境ごとに分離）

host ネットワークでは2つの LiveKit がホストの同じネットワークを共有するため、
**すべてのポートを環境間で重複させられません**。

| | mainnet | testnet |
|---|---|---|
| シグナリング | **7880** | **7883** |
| WebRTC UDP | 50000 | 50001 |
| WebRTC TCP フォールバック | 7881 | 7882 |
| ホスト名 | `livekit.example.com` | `livekit-test.example.com` |
| API 鍵 | `*_MAIN` | `*_TEST` |

### 使用する LiveKit のバージョン

本番構成では `latest` を使わず、動作確認済みの **`livekit/livekit-server:v1.13.6`**
に固定しています（mainnet / testnet とも同一）。更新する際は両方を揃えて変更し、
実機で疎通確認をやり直してください。

### コンテナ構成

testnet 版 / mainnet 版のアプリが別々の compose プロジェクトで動いているため、
LiveKit は**独立した3つ目のプロジェクト**として切り出しています。

```
[harbor-voice]  livekit-main（host net）  livekit-test（host net）
                        ▲                         ▲
                        │  host.docker.internal   │
[harbor-main]   app ────┘                         │
[harbor-test]   app ──────────────────────────────┘
```

LiveKit は host ネットワークにいるため、**コンテナ名では引けません**。
アプリからは `http://host.docker.internal:7880`（testnet は `:7883`）で
管理 API（発言権の付与・参加者一覧）を叩きます。

## 2. 通信経路の考え方

### Cloudflare Tunnel は「使える」が「全部は通せない」

**シグナリング（HTTPS/WSS）は Cloudflare Tunnel を通せます。** WebSocket は
Cloudflare がそのまま扱えるため、ポート開放も証明書も要りません。

**一方、WebRTC の音声メディアは通せません。** UDP を使うためです。したがって
メディア用のポートだけはルーターで開放し、グローバルIPへ直接届かせます。

```
シグナリング: ブラウザ → Cloudflare Edge → Tunnel → livekit:7880
音声メディア: ブラウザ → グローバルIP:UDP → livekit（Cloudflare を通らない）
```

メディアが Cloudflare を通らなくても安全性は保たれます。**WebRTC 自身が
DTLS-SRTP で暗号化**しているためです。証明書もドメインも不要です。

### なぜ host ネットワークなのか

当初は Docker の bridge ネットワーク＋個別ポート publish で構成していましたが、
**LAN 内の PC から接続できない**問題が起きました。

LiveKit が自分のアドレスとして認識していたのが bridge 内のアドレス
（`172.x.x.x`）だったため、ICE candidate にはグローバルIPしか載りません。
外部のスマートフォンからは繋がる一方、**同じ LAN 内の PC は自分のルーターの
グローバルIPへ接続しようとして NAT loopback（ヘアピンNAT）の制約に阻まれます**。

`network_mode: host` にすると LiveKit がサーバーの LAN アドレスを直接扱えるように
なり、`advertise_internal_ip: true` と併せて **LAN アドレスとグローバルIPの両方**を
candidate として広告します。

```
LAN 内 PC        → 192.168.0.x（サーバーの LAN アドレス）
外部スマートフォン → グローバルIP
```

これで両方から接続が成立します。

### DNS の扱い

シグナリング用ホスト名は **Cloudflare Tunnel の Public Hostname として作成**します。
`DNS only`（グレー雲）でグローバルIPへ向ける旧来のやり方は**しません**。

```
livekit.example.com → Cloudflare Edge → Cloudflare Tunnel → localhost:7880
```

メディアはこのホスト名を経由しません。ICE が**サーバーのグローバルIPへ直接**
接続します。**Cloudflare のIPが ICE candidate として広告されてはいけません。**

---

## 3. 事前に必要なもの

- 自鯖のグローバルIP（固定 or DDNS）
- 稼働中の Cloudflare Tunnel（Harbor 本体で既に使っているもの）
- ルーター/ファイアウォールの設定権限（メディアポート開放のため）
- Docker / Docker Compose

---

## 4. セットアップ手順

### Step 1. API 鍵を生成する

**環境ごとに必ず別の値**にします。鍵を分けておくことで、片方が漏洩しても
もう片方のharborTalkには入れません。

```bash
openssl rand -hex 16   # KEY 用（2つ）
openssl rand -hex 16   # SECRET 用（2つ・32文字になる）
```

> API Secret は**サーバー側のみ**で保持します。ブラウザへ渡すのは、サーバーが
> 発行した LiveKit 接続用 JWT だけです。`NEXT_PUBLIC_*` に入れてはいけません。

### Step 2. ルーターでメディアポートを開放する

自鯖のローカルIP宛に、以下を転送します。**80/443/7880 は開けません。**

| ポート | プロトコル | 用途 |
|---|---|---|
| 50000 | **UDP** | mainnet の音声メディア |
| 50001 | **UDP** | testnet の音声メディア |
| 7881 | TCP | mainnet のフォールバック（UDP が塞がれた利用者向け） |
| 7882 | TCP | testnet のフォールバック |

UFW を使っている場合の例です。

```bash
sudo ufw allow 7881/tcp
sudo ufw allow 7882/tcp
sudo ufw allow 50000/udp
sudo ufw allow 50001/udp
```

> Harbor 本体など**別用途で既に 80/443 を使っている場合は、それを閉じないでください。**
> ここで言っているのは「LiveKit のためには開けなくてよい」という意味です。

### Step 3. 音声スタックの設定ファイルを作る

```bash
cp .env.voice.example .env.voice
```

`.env.voice` を編集します。

```bash
LIVEKIT_API_KEY_MAIN=＜Step1で生成したKEY①＞
LIVEKIT_API_SECRET_MAIN=＜Step1で生成したSECRET①＞
LIVEKIT_API_KEY_TEST=＜Step1で生成したKEY②＞
LIVEKIT_API_SECRET_TEST=＜Step1で生成したSECRET②＞

LIVEKIT_DOMAIN_MAIN=livekit.example.com
LIVEKIT_DOMAIN_TEST=livekit-test.example.com
```

> `.env.voice` は `.gitignore` 済みです（実鍵を含むため追跡されません）。

### Step 4. 音声スタックを起動する

**アプリより先に起動してください。** アプリと cloudflared が参加する
`harbor-voice` ネットワークをこのプロジェクトが作成するためです。

```bash
docker compose -f docker-compose.voice.yml --env-file .env.voice -p harbor-voice up -d
```

起動ログで **node IP・TCP ポート・UDP レンジ**が意図どおりか確認します。

```bash
docker compose -p harbor-voice logs livekit-main | grep -E "starting LiveKit server|node IP|NAT1To1"
docker compose -p harbor-voice logs livekit-test | grep -E "starting LiveKit server|node IP|NAT1To1"
```

期待する値:

| | mainnet | testnet |
|---|---|---|
| `portHttp` | 7880 | **7883** |
| `rtc.portTCP` | 7881 | 7882 |
| `rtc.portUDP` | 50000 | 50001 |
| `nodeIP` | サーバーのアドレス | 同左 |
| `advertiseInternalIP` | `true` | `true` |

`nodeIP` がローカルIP（192.168.x.x 等）になっている場合は、
[トラブルシューティング](#ice-candidate-にローカルipしか出ない)の手動指定モードへ。

> UDP は1ポートに多重化しているため、起動は数秒で完了します。詳細は
> [運用メモ](#udp-mux単一ポート多重化について)を参照してください。
```

### Step 5. cloudflared から LiveKit へ到達できるようにする

LiveKit は host ネットワークで動いているため、**ホストの localhost で待ち受けています**。

| 環境 | 接続先 |
|---|---|
| mainnet | `http://localhost:7880` |
| testnet | `http://localhost:7883` |

#### cloudflared をホストOSで動かしている場合

そのまま `localhost` で到達できます。**追加の設定は不要**です。

#### cloudflared を Docker で動かしている場合

コンテナ内の `localhost` はコンテナ自身を指すため、ホストを参照する必要があります。
cloudflared のサービスに host gateway を追加してください。

```yaml
services:
  cloudflared:
    # …既存の設定…
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

接続先は `http://host.docker.internal:7880` / `:7883` になります。

> 以前のバージョンでは `livekit-main:7880` のようにコンテナ名で参照していましたが、
> **host ネットワーク化により名前解決できなくなりました**。この方法は使えません。

### Step 6. Cloudflare Tunnel に ingress を追加する

**既存の Harbor 用ホスト名は消さず、追記して共存させます。**

設定ファイル（`config.yml`）で管理している場合:

```yaml
ingress:
  # …既存の Harbor 用エントリはそのまま…

  - hostname: livekit.example.com
    service: http://localhost:7880         # Docker の cloudflared なら host.docker.internal

  - hostname: livekit-test.example.com
    service: http://localhost:7883         # testnet は 7883

  - service: http_status:404
```

Cloudflare ダッシュボードの Public Hostname で管理している場合も同じ考え方で、
2つのホスト名を追加します。

> **Cloudflare Access などの追加認証を LiveKit のホスト名に付けないでください。**
> LiveKit SDK の WebSocket 接続を壊す可能性があります。認可は Harbor が発行する
> LiveKit JWT で行っています。WebSocket をブロックするルールも設定しないでください。

### Step 7. 各環境のアプリ設定を書く

**mainnet 環境の `.env`**

```bash
LIVEKIT_API_KEY=＜LIVEKIT_API_KEY_MAIN と同じ値＞
LIVEKIT_API_SECRET=＜LIVEKIT_API_SECRET_MAIN と同じ値＞
LIVEKIT_WS_URL=wss://livekit.example.com
LIVEKIT_API_URL=http://host.docker.internal:7880
```

**testnet 環境の `.env`**

```bash
LIVEKIT_API_KEY=＜LIVEKIT_API_KEY_TEST と同じ値＞
LIVEKIT_API_SECRET=＜LIVEKIT_API_SECRET_TEST と同じ値＞
LIVEKIT_WS_URL=wss://livekit-test.example.com
LIVEKIT_API_URL=http://host.docker.internal:7883
```

> `LIVEKIT_WS_URL` にポート番号は不要です（Cloudflare が 443 で受けるため）。
>
> これらは**サーバー側の変数**（`NEXT_PUBLIC_` が付かない）です。接続先URLは
> サーバーがトークンと一緒にクライアントへ渡すため、**コードにハードコードされて
> おらず、クライアントバンドルにも焼き込まれません**。

### Step 8. アプリを起動する

音声を使う環境では、`docker-compose.voice-app.yml` を `-f` で重ねます。
これがアプリを `harbor-voice` ネットワークに参加させるオーバーレイです。

```bash
# mainnet
docker compose -f docker-compose.yml -f docker-compose.voice-app.yml \
  -p harbor-main up -d --build

# testnet
docker compose -f docker-compose.yml -f docker-compose.voice-app.yml \
  -p harbor-test up -d --build
```

> オーバーレイを重ねずに素の `docker compose up -d` で起動すれば、
> 従来どおり**harborTalkなし**で動きます。

### Step 9. 動作確認

1. `/community` で適当なトピックを開く
2. チャット入力バーの上段に「🎧 harborTalk」の行が出ていることを確認
   （**出ない場合は環境変数が未設定**）
3. 右端の「参加」を押し、自分のアイコンが行に並べば**シグナリング（①）は成功**
4. 「🎙 発言 0/5」→ ブラウザのマイク許可を承認 → 表示が「🎧 聴講に戻る」に変わり、
   声を出すと自分のチップが緑に光る
5. **別の端末・別回線**（スマホを 4G/5G に切り替える）から同じトピックに参加し、
   音声が届くか確認 → 届けば**メディア（②）も成功**
6. 2台以上を発言者に昇格させ、**双方向**に声が届くことを確認
7. 発言者を聴講に戻すと publish できなくなることを確認
8. mainnet と testnet の両方で確認し、**混線しないこと**を確認

> 手順5は必ず**別回線**で試してください。同じ LAN 内だと UDP がルーターを
> 経由しないため、ポート開放の不備に気づけません。

#### 外部IPが ICE candidate に使われているか確認する

LAN 外のスマートフォンを 4G/5G に切り替えてharborTalkに参加し、
PC 側の Chrome で `chrome://webrtc-internals` を開きます。

該当の接続を選び、次を確認します。

| 項目 | 期待値 |
|---|---|
| selected candidate pair | `succeeded` になっている |
| remote candidate | **Harbor サーバーのグローバルIP**（自社回線） |
| protocol | `udp`（`tcp` ならフォールバック動作） |

**メディアの接続先が Cloudflare のIPになっていないこと**を必ず確認してください。
Cloudflare のIPが出ている場合は構成が誤っています。メディアは Cloudflare を
通さず、グローバルIPへ直接繋がるのが正しい状態です。

```
signaling : Browser → Cloudflare → Tunnel → LiveKit:7880
media     : Browser → 自社回線のグローバルIP → LiveKit   ← Cloudflare を通らない
```

開発モードであれば、アプリのコンソールに出る `[harborTalk] ICE 診断` でも
同じ内容（protocol / local / remote candidate）を確認できます。

### 既存環境をharborTalk対応に更新する

すでに稼働している環境に追加する場合の手順です。**`git pull` と
`docker compose up -d --build` だけでは動きません**（音声スタックが別プロジェクト
のため）。段階的に進めることを推奨します。

> **DB について**: harborTalkはデータモデルを追加していないため、マイグレーションの
> 心配は不要です（`entrypoint.sh` の `prisma db push` は冪等です）。

| Phase | 内容 |
|---|---|
| A | `git pull` → `docker compose -p <既存プロジェクト名> up -d --build`。`.env` に `LIVEKIT_*` を書かなければ**harborTalkは非表示のまま**なので、既存機能への影響だけ先に確認できる |
| B | Step 2 のポート開放（コマンドではない作業） |
| C | Step 3〜6（音声スタック起動 → cloudflared 接続 → ingress 追加） |
| D | Step 7〜8（`.env` 設定 → オーバーレイ付きで再起動） |

> **注意点**
> - **プロジェクト名（`-p`）は既存と同じものを使う**こと。変えると別スタックが
>   二重に作られます（現在の名前は `docker ps` の `<プロジェクト名>-app-1` で確認できます）
> - **順序が重要**。Phase C を先に実行しないと `harbor-voice` ネットワークが無く
>   Phase D が失敗します
> - **Phase D 以降は毎回オーバーレイが必要**。素の `docker compose up -d` に戻すと
>   アプリがネットワークから外れ、発言権の付与が失敗します

### 環境変数を変更したときに再ビルドが要るか

`LIVEKIT_*` は `NEXT_PUBLIC_*` ではないため基本的に実行時変数ですが、
**`LIVEKIT_WS_URL` だけは例外**です。Next.js は `next.config.ts` の `headers()` の
結果を**ビルド時に `routes-manifest.json` へ焼き込み**、実行時には再評価しません。
`LIVEKIT_WS_URL` は CSP の `connect-src` に使われるため、ビルド時にも渡しています
（`docker-compose.yml` の `app.build.args`）。

ただし **CSP は `wss:` を包括的に許可**しているため（`connect-src` は既に `https:` を
許可済みで実質的な緩和にはならない）、**本番のように `wss://` を使う構成なら
ドメインを変えても再ビルドは不要**です。

| 変更した変数 | 必要な操作 |
|---|---|
| `LIVEKIT_API_KEY` / `_SECRET` / `_API_URL` | 再起動のみ |
| `LIVEKIT_WS_URL`（`wss://`） | 再起動のみ |
| `LIVEKIT_WS_URL`（`ws://`・ローカル検証） | **再ビルド** |

---

## 5. ローカル環境での単独テスト

**開発 PC 1台だけで動作確認できます。** ローカルはサイトが `http://localhost` で配信され、
mixed content 制限の対象外なので **`ws://` がそのまま使えます**。したがって
**Cloudflare Tunnel も DNS も証明書も、ルーターのポート開放も不要**です。

> `localhost` はブラウザが「セキュアコンテキスト」として扱うため、HTTP でも
> マイク（`getUserMedia`）が使えます。ただし **`http://192.168.x.x` では使えません**
> （セキュアコンテキストと見なされないため）。スマホからの実機確認は
> HTTPS 環境が必要です。

アプリの動かし方によって手順が変わります。

- **A. `npm run dev`（ホストで直接）** … 下の 5-A
- **B. `docker compose`（コンテナ）** … 下の 5-B ← 接続先の書き方が変わるので注意

### 共通 Step 1. 鍵を決める

**`.env` に既に `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` がある場合は、その値をそのまま使います。**
LiveKit サーバー側にも同じ鍵を教える必要があるためです。

> ⚠️ **よくある失敗**: `.env` の鍵と LiveKit サーバーに渡した鍵が食い違うと、
> 参加時に「音声スペースに接続できませんでした」になります。サーバーのログには
> `invalid API key` が出ます。必ず同じ値にしてください。
>
> ```bash
> docker logs harbor-livekit-local | grep "invalid API key"
> ```

まだ鍵が無ければ生成します（シークレットは32文字以上）。

```bash
openssl rand -hex 16   # KEY
openssl rand -hex 16   # SECRET（32文字になる）
```

### 共通 Step 2. LiveKit をローカルで起動する

設定ファイルなしで、コンテナ1つだけで動きます。UDP も**1ポートに多重化**するので
レンジ開放は不要です。`.env` の鍵をそのまま読ませます。

```bash
KEY=$(grep '^LIVEKIT_API_KEY=' .env | cut -d= -f2- | tr -d '"'"'"' ')
SECRET=$(grep '^LIVEKIT_API_SECRET=' .env | cut -d= -f2- | tr -d '"'"'"' ')

docker run -d --name harbor-livekit-local \
  -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  -e LIVEKIT_KEYS="${KEY}: ${SECRET}" \
  livekit/livekit-server:v1.13.6 --dev --node-ip 127.0.0.1 --udp-port 7882
```

| ポート | 用途 |
|---|---|
| 7880/TCP | シグナリング（ローカルは `ws://` で直接続。Tunnel 不要） |
| 7881/TCP | UDP が通らないときのフォールバック |
| 7882/UDP | 音声メディア（`--udp-port` で1ポートに多重化） |

起動を確認します。

```bash
docker logs harbor-livekit-local | grep "starting LiveKit server"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7880/   # → 200
```

> `--dev` はログレベルを debug にするだけで、**鍵は自動設定されません**。
> 上記のように `LIVEKIT_KEYS`（`キー: シークレット` 形式）で明示的に渡してください。

---

### 5-A. `npm run dev` で動かす場合

`.env` に次の2行を足します（鍵は Step 1 のものが既に入っている前提）。

```bash
LIVEKIT_WS_URL=ws://localhost:7880
LIVEKIT_API_URL=http://localhost:7880
```

アプリがホストで直接動くので、どちらも `localhost` で届きます。

```bash
npm run dev
```

---

### 5-B. `docker compose` で動かす場合

コンテナから見た `localhost` は**コンテナ自身**を指すため、`LIVEKIT_API_URL` に
`localhost` は**使えません**。LiveKit を同じ Docker ネットワークに入れて、
**コンテナ名で参照**します。

**① LiveKit をアプリと同じネットワークに参加させる**

```bash
# プロジェクト名が nagexym の場合、ネットワークは nagexym_default
docker network connect nagexym_default harbor-livekit-local
```

（`docker inspect <アプリのコンテナ名> --format '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}'`
でネットワーク名を確認できます）

**② `.env` に次の2行を足す**

```bash
LIVEKIT_WS_URL=ws://localhost:7880                  # ブラウザ（ホスト上）から見た値
LIVEKIT_API_URL=http://harbor-livekit-local:7880    # コンテナから見た値
```

> **2つの URL は「見る主体」が違うので値も違います。**
>
> | 変数 | 誰が使う | 値 |
> |---|---|---|
> | `LIVEKIT_WS_URL` | ブラウザ（ホスト上） | `ws://localhost:7880` |
> | `LIVEKIT_API_URL` | app コンテナ（内部） | `http://harbor-livekit-local:7880` |

**③ 再ビルドして起動する**

```bash
docker compose -p <プロジェクト名> up -d --build
```

> **`--build` は必須です。** 音声機能を含む新しいコードをイメージに入れる必要があります。
> また `LIVEKIT_WS_URL` は CSP に使われる**ビルド時変数**でもあります（詳細は下の注記）。

**疎通確認**

```bash
docker exec <アプリのコンテナ名> node -e "
const {RoomServiceClient}=require('livekit-server-sdk');
new RoomServiceClient(process.env.LIVEKIT_API_URL, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
 .listRooms().then(r=>console.log('OK', r.length)).catch(e=>console.log('NG', e.message));
"
```

`OK 0` が出れば、鍵とネットワークの両方が正しい状態です。

---

### Step 3. 確認する

1. ログインし、`/community/new` でトピックを作る（未作成の場合）
2. そのトピックを開き、入力バーの上段に「🎧 harborTalk」の行が出ることを確認
3. 右端の「参加」→ 自分のアイコンが並べば**シグナリング成功**
4. 「🎙 発言 0/5」→ マイク許可を承認 → 声を出すと自分のチップが**緑に光る**

### Step 4.（任意）2人での通話を確認する

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

`.env` の `LIVEKIT_WS_URL` を空にすれば、音声スペースは非表示に戻ります。

### ローカルで詰まったときは

- **harborTalkの行が出ない** → `.env` の3つ（KEY / SECRET / WS_URL）が揃っているか確認。
  Docker の場合は**イメージが古い**可能性が高いので `--build` を付けて再ビルドする
- **「接続できませんでした」** → まず `docker logs harbor-livekit-local` を見る。
  `invalid API key` なら鍵の不一致（共通 Step 1 参照）
- **参加はできるが声が届かない** → UDP 7882 が塞がれている可能性。
  LiveKit は TCP 7881 へフォールバックするので、7881 も公開しているか確認
- **WSL2 で音声が不安定** → Windows のブラウザから WSL2 内の Docker へ UDP を
  転送する経路になるため、環境によっては不安定です。その場合は TCP フォールバック
  （7881）が使われます

---

## 6. 単一環境だけで使う場合

testnet または mainnet の片方だけで使う場合は、不要なほうを削るだけです。

1. `docker-compose.voice.yml` から `livekit-test` サービスを削除
2. `livekit.testnet.yaml` は不要
3. `.env.voice` の `*_TEST` 変数は不要
4. Cloudflare Tunnel の ingress も1つだけ
5. 開放するポートは `7881/TCP` と `50000/UDP` のみ

---

## 7. 設定リファレンス

### 音声スタック側（`.env.voice`）

| 変数 | 必須 | 説明 |
|---|---|---|
| `LIVEKIT_API_KEY_MAIN` / `_SECRET_MAIN` | ○ | mainnet 用の鍵。compose が `LIVEKIT_KEYS` に組み立てて渡す |
| `LIVEKIT_API_KEY_TEST` / `_SECRET_TEST` | ○ | testnet 用の鍵 |
| `LIVEKIT_DOMAIN_MAIN` / `_TEST` | 参考 | Cloudflare Tunnel の Public Hostname。compose は読まないが、各環境の `LIVEKIT_WS_URL` と一致させる |

ポート番号は環境変数ではなく `livekit.*.yaml` に直接書いています。ICE candidate に
実ポートが載るため、外から差し替えられる形にしていません。

### アプリ側（各環境の `.env`）

| 変数 | 必須 | 説明 |
|---|---|---|
| `LIVEKIT_API_KEY` | ○ | この環境に対応する鍵。`.env.voice` の値と一致させる |
| `LIVEKIT_API_SECRET` | ○ | 同上。**ブラウザへは渡らない** |
| `LIVEKIT_WS_URL` | ○ | ブラウザが繋ぐ公開URL（例 `wss://livekit.example.com`） |
| `LIVEKIT_API_URL` | 任意※ | 管理 API の接続先。`http://host.docker.internal:7880`（testnet は `:7883`） |

※ コードとしては省略可能ですが、**この構成では実質必須**です。省略すると
Cloudflare 経由で自分に戻る遠回りな経路になります。アプリの compose には
`extra_hosts: host.docker.internal:host-gateway` が必要です（設定済み）。

上3つが揃ったときだけharborTalkが有効になります（1つでも欠けると非表示）。

### ポート一覧

**Internet へ公開する（ルーターで転送する）**

| ポート | 環境 | 用途 |
|---|---|---|
| 50000/UDP | mainnet | 音声メディア（UDP mux で多重化） |
| 50001/UDP | testnet | 音声メディア（UDP mux で多重化） |
| 7881/TCP | mainnet | UDP 不可時のフォールバック |
| 7882/TCP | testnet | UDP 不可時のフォールバック |

**公開しない**

| ポート | 理由 |
|---|---|
| 7880/TCP（mainnet） | シグナリング。Cloudflare Tunnel からのみ到達させる |
| 7883/TCP（testnet） | 同上 |
| 80/TCP・443/TCP | LiveKit のためには不要。TLS 終端は Cloudflare Edge が行う |

Cloudflare Tunnel 自身が必要とする外向き通信は、既存の cloudflared 設定に従います。

---

## 8. トラブルシューティング

切り分けの基本は「**①シグナリングと②メディアのどちらで失敗しているか**」です。
参加して自分のアイコンが行に並べば①は成功しており、そこから先の
「声が聞こえない」は②の問題です。

### harborTalkの行が表示されない

`LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_WS_URL` のいずれかが未設定です。

```bash
docker compose -p harbor-main exec app env | grep LIVEKIT
```

3つとも値が入っているか確認し、足りなければ `.env` を直して再起動します。
Docker の場合は**イメージが古い**可能性もあるので `--build` を付け直します。

### 「harborTalkに接続できませんでした」と出る

①シグナリングの失敗です。ブラウザの開発者ツール（Console / Network）で
エラー内容を確認してください。

- **404 / 502 が返る** → Cloudflare Tunnel の ingress が LiveKit へ届いていません。
  cloudflared の ingress が `localhost:7880` / `localhost:7883` を指しているか
  （Docker 上なら `host.docker.internal`）を確認します
- **`Content Security Policy` エラー** → `LIVEKIT_WS_URL` が CSP に反映されていません。
  `wss://` なら包括許可されているので、まず URL のスキームを確認してください
- **`Mixed Content` エラー** → `LIVEKIT_WS_URL` が `ws://` になっています
- **WebSocket が即座に閉じる** → Cloudflare Access など追加認証が
  LiveKit のホスト名に掛かっていないか確認してください

Tunnel 経由の到達性はこう確認できます。

```bash
curl -I https://livekit.example.com
docker compose -p harbor-voice logs livekit-main | tail -30
```

### 参加はできるが声が聞こえない

②メディアの失敗です。**UDP ポートが開いていない**可能性が高いです。

同一 LAN 内では成功して外部から失敗する場合、ほぼ確実にルーターの UDP 転送設定が
原因です。`50000/UDP`（testnet は `50001/UDP`）を確認してください。

**開発モードでは実際の経路をコンソールで確認できます。** 参加して数秒後に
`[harborTalk] ICE 診断` というログが出ます。

```
[harborTalk] ICE 診断 {
  protocol: "udp",
  remoteCandidate: "srflx 203.0.113.10:50012",   ← サーバーのグローバルIPなら正常
  ...
}
```

- `protocol` が `tcp` → UDP が通らずフォールバックしています（UDP 開放を確認）
- `remoteCandidate` が LAN アドレス（192.168.x.x 等）→ **LAN 内から接続している場合は
  これが正常**です（`advertise_internal_ip: true` により LAN アドレスも広告されます）。
  外部回線から繋いでいるのにこれが出る場合は、グローバルIPの検出に失敗しています
- `remoteCandidate` が Cloudflare のIP → 構成が誤っています。メディアは
  Cloudflare を通してはいけません

### ICE candidate にローカルIPしか出ない

標準構成では LiveKit 自身にグローバルIPを検出させています
（`livekit.*.yaml` の `use_external_ip: true`、`--node-ip` は指定しません）。

NAT 構成によっては自動検出が効かず、ローカルIP（192.168.x.x / 10.x.x.x /
172.16-31.x.x）しか candidate に出ないことがあります。その場合のみ、
**手動指定モード**へ切り替えてください。

`livekit.mainnet.yaml` / `livekit.testnet.yaml` の `rtc:` を次のように変更します。

```yaml
rtc:
  tcp_port: 7881
  udp_port: 50000
  use_external_ip: false        # ← true から false へ
  node_ip: 203.0.113.10         # ← このサーバーのグローバルIP
```

> **`use_external_ip: true` と `node_ip` を同時に有効にしないでください。**
> 自動検出と手動指定が競合します。手動指定を使うときは必ず
> `use_external_ip: false` にします。
>
> 固定IPでない場合、DDNS 更新のたびにこの値も更新が必要です。標準は自動検出です。

```bash
docker compose -f docker-compose.voice.yml --env-file .env.voice -p harbor-voice up -d
```

### 「発言する」を押してもマイクが有効にならない

- **ブラウザがマイク許可を求めてこない** → サイトが HTTPS で配信されているか、
  ブラウザの設定でマイクがブロックされていないか確認
- **「マイクを使用できませんでした」** → OS/ブラウザのマイク権限を確認。
  この場合は発言権を自動的に返却するので、枠は空いたままになります
- **「発言権の反映に時間がかかっています」** → アプリから LiveKit への管理 API が
  届いていません。`LIVEKIT_API_URL` と、アプリが `harbor-voice` ネットワークに
  参加しているかを確認してください

### 発言権の付与が失敗する

アプリから LiveKit への疎通を確認します。

```bash
docker compose -p harbor-main exec app node -e "
const {RoomServiceClient}=require('livekit-server-sdk');
new RoomServiceClient(process.env.LIVEKIT_API_URL, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
 .listRooms().then(r=>console.log('OK', r.length)).catch(e=>console.log('NG', e.message));
"
```

`OK 0` が出れば鍵とネットワークの両方が正しい状態です。到達できない場合は、
`docker-compose.voice-app.yml` を `-f` で重ねずに起動している可能性が高いです。

### 「満員です」と出る

仕様どおりの挙動です。同時に発言できるのは**5人まで**で、上限に達すると
ボタンが無効になります。誰かが「聴講に戻る」か退出すれば枠が空きます。

### mainnet と testnet が混線する

ポートが重複していないか確認してください。UDP レンジと TCP フォールバックは
`livekit.mainnet.yaml` / `livekit.testnet.yaml` で分けており、**docker の
ポートマッピングでは付け替えられません**（ICE candidate に実ポートが載るため）。
変更する場合は設定ファイル側の `port_range_start` / `port_range_end` /
`tcp_port` を直してください。

---

## 9. 運用メモ

### アイコンの使い分け

既定が**聴講者**であることを伝えるため、入口は 🎧（聴く）にしている。
🎙（マイク）は**実際に発言権を得たときだけ**表示する。入口をマイクにすると
「話さないといけない」と受け取られ、参加そのものを敬遠されてしまうため。

| 状態 | 表示 |
|---|---|
| 未参加 | 🎧 harborTalk＋参加者一覧＋[参加] |
| 聴講中 | 参加者に自分が並ぶ＋[🎙 発言 n/5][退出] |
| 発言権あり | 行頭が 🎙 に変わり [🎧 聴講に戻る] |
| 発声中 | 自分のチップが緑に光る |

未参加でも参加者が見えるのは、メッセージ差分ポーリングのレスポンスに
音声参加者を相乗りさせているため（専用のポーリングは増やしていない）。
トピック一覧 `/community` のバッジは `listRooms()` を1回叩いて全トピック分を取得し、
5秒キャッシュを挟んでいる。

### セキュリティ上の設計

- **参加トークンはサーバーが発行**します。identity は `User.id` で、既定は
  `canPublish: false`（聴講者）。発言権はサーバー経由でしか取得できません
- **発言できるのはマイクのみ**です（`canPublishSources` をマイクに限定しているため、
  カメラや画面共有は使えません）
- **他人の発言権は操作できません**。発言権 API は常に「自分自身」だけを対象にします
- **参加者 metadata には公開情報のみ**（表示名・アイコン・受取アドレス）を載せています。
  秘密鍵やセッション情報は一切含みません
- トークンの有効期間は 2 時間、トークン発行のレート制限は 30 回/10分/ユーザーです
- **API Secret はサーバー側のみ**で保持し、ブラウザへ渡すのは JWT だけです
  （`NEXT_PUBLIC_*` には入れていません）
- JWT に載せるのは対象ルームと最小限の権限だけです。聴講者には publish 権限を
  与えず、発言権はサーバー経由でしか取得できません
- Cloudflare Tunnel 化にあたって、この認可方式は一切緩めていません

### host ネットワークでの注意点

`network_mode: host` により、LiveKit はホストのネットワークで直接待ち受けます。
**Docker によるバインド制限が効かないため、シグナリングポート（7880 / 7883）の
保護はルーター/ファイアウォール任せになります。**

ルーターで 7880 / 7883 を転送していないことを確認してください。加えて、
ファイアウォールでも明示的に塞いでおくと二重の防御になります。

```bash
# 待ち受け状況の確認
sudo ss -lntp | grep -E ':(7880|7883)'

# 例: LAN からのみ許可し、それ以外は拒否（環境に合わせて調整）
sudo ufw allow from 192.168.0.0/24 to any port 7880 proto tcp
sudo ufw allow from 192.168.0.0/24 to any port 7883 proto tcp
```

シグナリングは Cloudflare Tunnel が `localhost` 経由で到達するため、
**外部へ公開する必要はありません**。

### 経路を分けている理由（Cloudflare Tunnel 併用）

**制御系は Cloudflare Tunnel で隠し、リアルタイム音声だけを直接 SFU へ流す**のが
この構成の基本思想です。

- シグナリングを Tunnel に通すことで、80/443 の開放も証明書管理も不要になり、
  オリジンのIPも露出しません
- メディアは UDP のため Tunnel を通せませんが、WebRTC 自身が DTLS-SRTP で
  暗号化するため、直接接続でも内容は保護されます
- ICE candidate には**サーバーのグローバルIP**が載ります。Cloudflare のIPが
  載る構成にしてはいけません（メディアが Cloudflare を経由してしまい繋がりません）

### UDP mux（単一ポート多重化）について

Harbor のharborTalkは **LiveKit の UDP mux 機能**を使い、全参加者の WebRTC 通信を
**1つの UDP ポート**へ多重化しています。

```
MAIN : UDP 50000
TEST : UDP 50001
```

通常の LiveKit 構成では参加者ごとにポートレンジを使えますが、Docker 上で大量の
UDP ポートを publish すると **publish 1ポートにつき `docker-proxy` が1プロセス**
起動するため、現実的に運用できません。

> 実測（5000ポート × 2環境 = 10,000ポート）: `docker compose up -d` が
> **10分でタイムアウト**し、コンテナは `Created` のまま起動せず、
> `docker-proxy` は2,600プロセスを超えてなお増加中でした。

UDP mux なら publish は1ポートで済み、容量も落ちません。Docker デーモンの
`userland-proxy` 設定変更や `network_mode: host` にも依存しない構成です。

**設定上の注意**

- `rtc.udp_port` を指定した場合、`rtc.port_range_start` / `rtc.port_range_end` は
  **使用しません**（併記しない）
- `livekit.*.yaml` の `udp_port` と `docker-compose.voice.yml` の publish は
  必ず一致させてください（ICE candidate に実ポートが載るため、docker 側でずらせません）

**host ネットワークとの関係**

現在は `network_mode: host` を採用しているため、そもそも Docker のポート publish を
行っていません。UDP mux は LiveKit 側の設定（`udp_port`）として維持しており、
ポートレンジ方式に戻す必要はありません。

### TURN について

現状は独自 TURN サーバーを立てていません。まず「UDP 直接 → 失敗したら
LiveKit の TCP フォールバック（7881/7882）」で運用します。

企業ネットワークや特殊な NAT で接続できないケースが確認された場合に、
TURN/TLS を追加できる余地は残してあります（LiveKit 側の設定追加で対応可能）。
現時点で不要に複雑化させない方針です。

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

# 音声スタック側（鍵・ポート）を変えた場合
docker compose -f docker-compose.voice.yml --env-file .env.voice -p harbor-voice up -d

# ホスト名を変えた場合は Cloudflare Tunnel の ingress も更新すること
```

鍵を変更した場合は、`.env.voice` と各環境の `.env` の**両方**を合わせて更新してください。
