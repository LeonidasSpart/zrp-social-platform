import Link from "next/link";

export default function NewsNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-600/10 text-2xl font-bold text-red-600">
          404
        </div>

        <h1 className="text-3xl font-bold">
          News article not found
        </h1>

        <p className="mt-3 text-muted-foreground">
          This ZRP News article may have been removed,
          unpublished, or the link may be incorrect.
        </p>

        <Link
          href="/news"
          className="mt-7 inline-flex rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Back to ZRP News
        </Link>
      </div>
    </main>
  );
}
