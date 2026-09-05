#!/bin/sh
set -e

# DB スキーマを反映してから本番サーバーを起動する。
# prisma db push は冪等なので毎回起動時に流して問題ない（マイグレーション運用に
# 切り替える場合は `prisma migrate deploy` に変更する）。
# 冪等。スキーマ変更が無ければ何もしない。破壊的変更が必要な場合は（データ保護のため）
# あえてエラーで止める設計とし、その際は手動で対応する。
echo "[entrypoint] Applying database schema (prisma db push)…"
npx prisma db push

# 既存の公開記事の publishAt を埋める（冪等・対象0件なら即終了）。
# 公開日の基準を createdAt から publishAt へ移した際の移行処理。
# これを飛ばすと publishAt が NULL の旧記事が新着一覧の先頭に来てしまう
# （Postgres の DESC は NULLS FIRST のため）。
# 失敗しても起動は止めない（表示順の問題であってサービス停止に値しないため、
# 次回起動時に再試行される）。
echo "[entrypoint] Backfilling Post.publishAt…"
node scripts/backfill-publish-at.mjs \
  || echo "[entrypoint] 警告: publishAt のバックフィルに失敗しました（次回起動時に再試行します）"

echo "[entrypoint] Starting Next.js (npm start)…"
exec npm start
