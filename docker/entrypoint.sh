#!/bin/sh
set -e

# DB スキーマを反映してから本番サーバーを起動する。
# prisma db push は冪等なので毎回起動時に流して問題ない（マイグレーション運用に
# 切り替える場合は `prisma migrate deploy` に変更する）。
# 冪等。スキーマ変更が無ければ何もしない。破壊的変更が必要な場合は（データ保護のため）
# あえてエラーで止める設計とし、その際は手動で対応する。
echo "[entrypoint] Applying database schema (prisma db push)…"
npx prisma db push

echo "[entrypoint] Starting Next.js (npm start)…"
exec npm start
