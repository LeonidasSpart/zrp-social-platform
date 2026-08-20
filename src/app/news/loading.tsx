export default function NewsLoading() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="mt-3 h-4 w-72 animate-pulse rounded bg-muted" />
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-2xl border bg-card"
            >
              <div className="aspect-video animate-pulse bg-muted" />

              <div className="space-y-3 p-5">
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                <div className="h-6 w-full animate-pulse rounded bg-muted" />
                <div className="h-6 w-4/5 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
