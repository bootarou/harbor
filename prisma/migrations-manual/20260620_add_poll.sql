-- アンケート（Twitter風投票）機能の追加に伴うスキーマ変更
-- 本プロジェクトは通常 `prisma db push` 運用（migrations 履歴なし）のため、
-- DB 起動後に `npm run db:push` で適用するか、本 SQL を直接実行してください。
--
-- 変更点:
--   1. Post.pollClosesAt 追加（投票締め切り・任意）
--   2. PollOption テーブル新設（アンケートの選択肢）
--   3. PollVote テーブル新設（投票。1ユーザー1票=UNIQUE(postId,userId)）

-- 1. Post に投票締め切りカラムを追加
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "pollClosesAt" TIMESTAMP(3);

-- 2. PollOption テーブル
CREATE TABLE IF NOT EXISTS "PollOption" (
    "id"        TEXT NOT NULL,
    "postId"    TEXT NOT NULL,
    "label"     TEXT NOT NULL,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PollOption_postId_idx" ON "PollOption"("postId");

ALTER TABLE "PollOption"
    ADD CONSTRAINT "PollOption_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. PollVote テーブル（1ユーザー1票）
CREATE TABLE IF NOT EXISTS "PollVote" (
    "id"        TEXT NOT NULL,
    "postId"    TEXT NOT NULL,
    "optionId"  TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PollVote_postId_userId_key" ON "PollVote"("postId", "userId");
CREATE INDEX IF NOT EXISTS "PollVote_optionId_idx" ON "PollVote"("optionId");
CREATE INDEX IF NOT EXISTS "PollVote_postId_idx" ON "PollVote"("postId");

ALTER TABLE "PollVote"
    ADD CONSTRAINT "PollVote_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote"
    ADD CONSTRAINT "PollVote_optionId_fkey"
    FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote"
    ADD CONSTRAINT "PollVote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
