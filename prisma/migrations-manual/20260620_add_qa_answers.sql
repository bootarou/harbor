-- QA（質問・回答）投稿タイプ追加に伴うスキーマ変更
-- 本プロジェクトは通常 `prisma db push` 運用（migrations 履歴なし）のため、
-- DB 起動後に `npm run db:push` で適用するか、本 SQL を直接実行してください。
--
-- 変更点:
--   1. Post.qaStatus 追加（"open" | "answered" | NULL）
--   2. Answer テーブル新設（QA への回答）
--   3. Tip.answerId 追加（回答への投げ銭を記事への投げ銭と区別）

-- 1. Post に QA 状態カラムを追加
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "qaStatus" TEXT;

-- 2. Answer テーブル
CREATE TABLE IF NOT EXISTS "Answer" (
    "id"          TEXT NOT NULL,
    "postId"      TEXT NOT NULL,
    "authorId"    TEXT NOT NULL,
    "contentHTML" TEXT NOT NULL,
    "isBest"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Answer_postId_idx" ON "Answer"("postId");
CREATE INDEX IF NOT EXISTS "Answer_postId_isBest_idx" ON "Answer"("postId", "isBest");

ALTER TABLE "Answer"
    ADD CONSTRAINT "Answer_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Answer"
    ADD CONSTRAINT "Answer_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Tip に answerId を追加（回答への投げ銭。記事への投げ銭は NULL のまま）
ALTER TABLE "Tip" ADD COLUMN IF NOT EXISTS "answerId" TEXT;

CREATE INDEX IF NOT EXISTS "Tip_answerId_idx" ON "Tip"("answerId");

ALTER TABLE "Tip"
    ADD CONSTRAINT "Tip_answerId_fkey"
    FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
