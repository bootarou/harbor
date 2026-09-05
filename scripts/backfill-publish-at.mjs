/**
 * 既存記事の publishAt を埋めるワンショットスクリプト。
 *
 * この修正以前は「公開日」に createdAt（＝下書きを作った日時）を使っていた。
 * これ以降は publishAt を公開日として扱うため、既存の公開記事には
 * 従来と同じ createdAt を publishAt へ移し、表示や並び順が変わらないようにする。
 *
 *   node scripts/backfill-publish-at.mjs
 *
 * 何度実行しても結果は変わらない（未設定のものだけ埋める）。
 *
 * editedAt は埋めない。updatedAt は閲覧数カウントでも動くため
 * 「本文を編集した日時」として信用できず、埋めると誤った更新日を表示してしまう。
 * 既存記事は次に編集・保存されたときに editedAt が入る。
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BATCH = 500;

async function main() {
  let filled = 0;
  for (;;) {
    const rows = await prisma.post.findMany({
      where: { published: true, publishAt: null },
      select: { id: true, createdAt: true, updatedAt: true },
      take: BATCH,
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      await prisma.post.update({
        where: { id: r.id },
        // updatedAt を明示的に元の値で書き戻す。
        // そうしないと @updatedAt が発火し、全記事の更新日時が実行時刻になってしまう。
        data: { publishAt: r.createdAt, updatedAt: r.updatedAt },
      });
    }
    filled += rows.length;
    console.log(`publishAt を設定: ${filled} 件`);
  }
  console.log(`完了: ${filled} 件`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
