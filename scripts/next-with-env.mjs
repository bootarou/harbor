// `.env` を環境変数へ読み込んでから next を起動するラッパー。
//
// Next.js は HTTP サーバの起動が .env 読み込みより前に行われるため、
// `PORT` を .env から直接読まない（公式仕様）。
// このラッパーで起動前に .env を process.env へ展開することで、
// `.env` の PORT / HOSTNAME を `npm run dev` / `npm start` に反映させる。
//
// 既にシェルで指定された環境変数（例: `PORT=5000 npm run dev`）が優先される
// （dotenv は既存の値を上書きしないため）。
import "dotenv/config";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const args = process.argv.slice(2); // 例: ["dev"] / ["start"]

// PATH 依存を避けるため next の CLI を明示解決し、現在の Node で実行する。
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, ...args], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
