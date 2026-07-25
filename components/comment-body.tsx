import Link from "next/link";
import { Fragment } from "react";

export type MentionUser = { id: string; displayName: string };

// コメント本文中の「@表示名」を、メンション先ユーザーのプロフィールリンクに変換して表示する。
// 本文はプレーンテキストのまま扱う（React が自動エスケープ）。mentions で渡された
// ユーザーの表示名だけをハイライト対象にする（無関係な @文字列はそのまま）。
export function CommentBody({
  body,
  mentions,
}: {
  body: string;
  mentions: MentionUser[];
}) {
  if (mentions.length === 0) {
    return <p className="mt-2 whitespace-pre-wrap text-sm">{body}</p>;
  }

  // 長い表示名を優先してマッチ（"Bob" より "Bobby" を先に）。
  const tokens = [...mentions].sort(
    (a, b) => b.displayName.length - a.displayName.length
  );

  const nodes: React.ReactNode[] = [];
  let buf = "";
  let i = 0;
  let key = 0;
  while (i < body.length) {
    let matched: MentionUser | null = null;
    if (body[i] === "@") {
      for (const t of tokens) {
        if (body.startsWith(t.displayName, i + 1)) {
          matched = t;
          break;
        }
      }
    }
    if (matched) {
      if (buf) {
        nodes.push(<Fragment key={key++}>{buf}</Fragment>);
        buf = "";
      }
      nodes.push(
        <Link
          key={key++}
          href={`/users/${matched.id}`}
          className="font-medium text-teal-600 hover:underline dark:text-teal-400"
        >
          @{matched.displayName}
        </Link>
      );
      i += 1 + matched.displayName.length;
    } else {
      buf += body[i];
      i += 1;
    }
  }
  if (buf) nodes.push(<Fragment key={key++}>{buf}</Fragment>);

  return <p className="mt-2 whitespace-pre-wrap text-sm">{nodes}</p>;
}
