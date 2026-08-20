"use client";

export default function NewsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-600/10 text-2xl">
          !
        </div>

        <h1 className="text-2xl font-bold">
          ZRP News
        </h1>

        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          We couldn&apos;t load the news right now. Please try again.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Try again
          </button>

          <a
            href="/"
            className="rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}
