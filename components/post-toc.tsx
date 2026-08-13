import type { TocEntry } from "@/lib/toc";

// 記事の目次リスト（本文の見出しへのアンカーリンク）。H2/H3 は段付きで表示。
export function PostTocList({ toc }: { toc: TocEntry[] }) {
  return (
    <nav aria-label="目次">
      <ul className="flex flex-col gap-1 text-sm">
        {toc.map((t) => (
          <li key={t.id} style={{ paddingLeft: `${(t.level - 1) * 0.75}rem` }}>
            <a
              href={`#${t.id}`}
              className="block truncate text-gray-600 transition hover:text-teal-600 hover:underline dark:text-gray-400 dark:hover:text-teal-400"
              title={t.text}
            >
              {t.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
