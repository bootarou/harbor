export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16">
      <div className="animate-pulse space-y-4">
        <div className="h-7 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-24 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-24 rounded bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}
