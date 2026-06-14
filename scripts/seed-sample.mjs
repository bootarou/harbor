// サンプルデータ投入スクリプト（検証用）。
// 実行: node --env-file=.env scripts/seed-sample.mjs
// 固定IDで upsert するため、再実行しても重複しません。
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function randAddress() {
  let s = "T";
  for (let i = 0; i < 38; i++) s += B32[Math.floor(Math.random() * 32)];
  return s;
}
function randHex(n) {
  let s = "";
  for (let i = 0; i < n; i++) s += "0123456789ABCDEF"[Math.floor(Math.random() * 16)];
  return s;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const NAMES = [
  "さくら", "けんた", "みなと", "ひなた", "そうた",
  "ゆい", "はると", "あおい", "りく", "つむぎ",
];
const TAG_POOL = [
  "Symbol", "XYM", "ブログ", "暗号資産", "技術",
  "日記", "料理", "旅行", "ガジェット", "NFT", "投資", "プログラミング",
];
const TITLES = [
  "Symbolウォレットを作ってみた", "はじめての投げ銭体験", "テストネットFaucetの使い方",
  "ノンカストディアルって何？", "ブログを始めた理由", "今日の自炊メモ",
  "週末の小旅行ログ", "新しいキーボードを買った", "NFTの基礎知識",
  "暗号資産の税金メモ", "TypeScriptの便利機能", "Next.jsで個人開発",
  "Prismaでスキーマ設計", "Tailwindの小技集", "エラーと向き合う一日",
  "おすすめの作業BGM", "朝活はじめました", "読書記録：技術書3冊",
  "XYMの送金手数料の話", "投げ銭文化について考える",
];

function makeContent(title) {
  return (
    `<h2>${title}</h2>` +
    `<p>これはサンプル記事です。表示や一覧・ページネーションの検証用に自動生成しました。</p>` +
    `<p>Symbol(XYM) の投げ銭機能や、タグ・検索の動作確認にご利用ください。</p>` +
    `<ul><li>ポイント1</li><li>ポイント2</li><li>ポイント3</li></ul>` +
    `<p>最後までお読みいただきありがとうございました。</p>`
  );
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  // 10 users（最後の1人だけ XYM 未設定にして「投げ銭不可」表示も検証できるように）
  const users = [];
  for (let i = 1; i <= 10; i++) {
    const id = `sample_u${i}`;
    const u = await prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        email: `sample${i}@example.com`,
        passwordHash,
        displayName: `${NAMES[i - 1]}（サンプル${i}）`,
        bio: `サンプルユーザー${i}の自己紹介です。よろしくお願いします。`,
        xAccount: `sample_user_${i}`,
        xymAddress: i === 10 ? null : randAddress(),
      },
    });
    users.push(u);
  }

  // 20 posts（著者を循環、createdAt をずらして並び順/ページネーションを検証）
  const posts = [];
  const now = Date.now();
  for (let i = 1; i <= 20; i++) {
    const id = `sample_p${i}`;
    const author = users[(i - 1) % users.length];
    const tags = [pick(TAG_POOL), pick(TAG_POOL)].filter(
      (v, idx, a) => a.indexOf(v) === idx
    );
    const createdAt = new Date(now - i * 3600 * 1000 * 6); // 6時間ずつ過去へ
    const title = TITLES[i - 1];
    const p = await prisma.post.upsert({
      where: { id },
      update: {},
      create: {
        id,
        authorId: author.id,
        title,
        contentHTML: makeContent(title),
        published: true,
        tags,
        createdAt,
        updatedAt: createdAt,
      },
    });
    posts.push(p);
  }

  // 一部の記事に投げ銭（確定済み）を付与してインジケータ/履歴を検証
  let tipCount = 0;
  for (const post of posts) {
    const author = users.find((u) => u.id === post.authorId);
    if (!author?.xymAddress) continue;
    const numTips = Math.floor(Math.random() * 4); // 0〜3件
    for (let k = 0; k < numTips; k++) {
      const sender = pick(users.filter((u) => u.id !== author.id && u.xymAddress));
      if (!sender) continue;
      const amount = (Math.floor(Math.random() * 100) + 1) / 10; // 0.1〜10.0
      const txHash = randHex(64);
      await prisma.tip.upsert({
        where: { txHash },
        update: {},
        create: {
          postId: post.id,
          fromAddress: sender.xymAddress,
          toAddress: author.xymAddress,
          amount,
          txHash,
          fromUserId: sender.id,
          anonymous: Math.random() < 0.3,
          confirmed: true,
        },
      });
      tipCount++;
    }
  }

  console.log(
    `seeded: users=${users.length}, posts=${posts.length}, tips=${tipCount}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
