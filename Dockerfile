# Harbor (nageXym) — Next.js 16 + Prisma 7 本番イメージ。
# sharp / symbol-sdk のため glibc ベース（bookworm-slim）を使用。

############################
# 1) 依存インストール
############################
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# OpenSSL が無いと Prisma が libssl のバージョンを検出できず openssl-1.1.x 版の
# エンジンを落としてしまう。実行段は OpenSSL 3.0 なので合致せず、起動のたびに
# binaries.prisma.sh から 3.0.x 版をダウンロードする羽目になる（起動が外部依存になる）。
# ここで入れておけば npm ci の postinstall が正しい 3.0.x 版を取得する。
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# postinstall (prisma generate) が npm ci 中に走るため、スキーマ／設定を先に置く。
# generate は DB へ接続しないが、設定読み込み用にダミーの DATABASE_URL を与える。
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

############################
# 2) ビルド
############################
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# deps 段と同じ理由で OpenSSL が必要（prisma generate / schema-engine の事前取得）。
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# NEXT_PUBLIC_* はビルド時にクライアントバンドルへインライン化されるため、
# 実行時ではなく build 引数として渡す必要がある。
ARG NEXT_PUBLIC_SYMBOL_NETWORK=testnet
ARG NEXT_PUBLIC_SYMBOL_NODE_URL=https://sym-test-01.opening-line.jp:3001
ARG NEXT_PUBLIC_SYMBOL_EXPLORER_URL=
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_SITE_NAME=⚓Harbor
ARG NEXT_PUBLIC_S3_PUBLIC_URL=
# Web Push の VAPID 公開鍵。クライアントの購読に使うためビルド時に焼き込む。
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=
# LIVEKIT_WS_URL は NEXT_PUBLIC_* ではないが、next.config.ts の CSP(connect-src)に
# 使われ、headers() はビルド時に routes-manifest へ焼き込まれるため build 時に必要。
# ws://（ローカル検証）を使う場合のみ必須。wss:// は CSP が包括許可するため不要。
ARG LIVEKIT_WS_URL=
ENV LIVEKIT_WS_URL=$LIVEKIT_WS_URL \
    NEXT_PUBLIC_SYMBOL_NETWORK=$NEXT_PUBLIC_SYMBOL_NETWORK \
    NEXT_PUBLIC_SYMBOL_NODE_URL=$NEXT_PUBLIC_SYMBOL_NODE_URL \
    NEXT_PUBLIC_SYMBOL_EXPLORER_URL=$NEXT_PUBLIC_SYMBOL_EXPLORER_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME \
    NEXT_PUBLIC_S3_PUBLIC_URL=$NEXT_PUBLIC_S3_PUBLIC_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

# ビルド中に Prisma Client を生成（prebuild フック）するためのダミー接続文字列。
# 実際の DB へは接続しない（ページはすべて動的のためビルド時クエリは走らない）。
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# package.json の prebuild フックで prisma generate → next build
RUN npm run build

# schema-engine をビルド時に取得してイメージへ焼き込む。
# prisma generate が落とすのは query engine だけで、起動時の `prisma db push` が使う
# schema-engine は含まれない。そのままだと**コンテナ起動のたびに**
# binaries.prisma.sh からダウンロードが走り、DNS/ネットワークが不安定だと
# 起動に失敗して再起動ループに入る（実際に発生）。
# migrate diff は DB 接続なしで schema-engine を使うため、これで取得だけ済ませる
# （このステージの node_modules はそのまま実行イメージへコピーされる）。
# deps 段で OpenSSL を入れてあるため、ここでは実行段と同じ openssl-3.0.x 版が
# 取得・同梱される（起動時ダウンロードが不要になる）。
# ネットワーク都合で失敗してもビルドは止めない（従来どおり実行時取得にフォールバック）。
RUN npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > /dev/null || echo "[build] schema-engine の事前取得に失敗（実行時に取得されます）"

############################
# 3) 実行
############################
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Tokyo

# Prisma の schema engine（起動時の db push）が libssl を必要とするため OpenSSL を導入。
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 実行に必要なものだけコピー（生成済み Prisma Client を含む node_modules も含む）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/proxy.ts ./proxy.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
