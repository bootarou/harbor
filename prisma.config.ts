import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7: スキーマの datasource からは url を外し、
// Migrate/CLI 用の接続情報はここで指定する。
// （アプリ実行時は lib/prisma.ts で driver adapter 経由で接続する）
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
