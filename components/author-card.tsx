import Link from "next/link";

type Author = {
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  xAccount: string | null;
  xymAddress: string | null;
};

// 著者情報の表示。XYM アドレスは公開アドレスのみ表示。
export function AuthorCard({
  author,
  userId,
}: {
  author: Author;
  userId?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-center gap-3">
        {userId ? (
          <Link href={`/users/${userId}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={author.avatarUrl || "/avatar-placeholder.svg"}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
            />
          </Link>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={author.avatarUrl || "/avatar-placeholder.svg"}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="font-semibold">
            {userId ? (
              <Link href={`/users/${userId}`} className="hover:underline">
                {author.displayName}
              </Link>
            ) : (
              author.displayName
            )}
          </p>
          {author.xAccount && (
            <a
              href={`https://x.com/${author.xAccount}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              @{author.xAccount}
            </a>
          )}
        </div>
      </div>

      {author.bio && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
          {author.bio}
        </p>
      )}

      {author.xymAddress && (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">XYM アドレス</p>
          <p className="mt-1 break-all font-mono text-xs">
            {author.xymAddress}
          </p>
        </div>
      )}
    </div>
  );
}
