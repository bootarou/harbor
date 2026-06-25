# Harbor (nageXym) — Next.js 16 + Prisma 7 本番イメージ。
# sharp / symbol-sdk のため glibc ベース（bookworm-slim）を使用。

############################
# 1) 依存インストール
############################
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
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

# NEXT_PUBLIC_* はビルド時にクライアントバンドルへインライン化されるため、
# 実行時ではなく build 引数として渡す必要がある。
ARG NEXT_PUBLIC_SYMBOL_NETWORK=testnet
ARG NEXT_PUBLIC_SYMBOL_NODE_URL=https://sym-test-01.opening-line.jp:3001
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_SITE_NAME=⚓Harbor
ARG NEXT_PUBLIC_S3_PUBLIC_URL=
ENV NEXT_PUBLIC_SYMBOL_NETWORK=$NEXT_PUBLIC_SYMBOL_NETWORK \
    NEXT_PUBLIC_SYMBOL_NODE_URL=$NEXT_PUBLIC_SYMBOL_NODE_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME \
    NEXT_PUBLIC_S3_PUBLIC_URL=$NEXT_PUBLIC_S3_PUBLIC_URL

# ビルド中に Prisma Client を生成（prebuild フック）するためのダミー接続文字列。
# 実際の DB へは接続しない（ページはすべて動的のためビルド時クエリは走らない）。
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# package.json の prebuild フックで prisma generate → next build
RUN npm run build

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
