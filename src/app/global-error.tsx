"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-gray-50 dark:bg-gray-900">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Something went wrong
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md">
            We're sorry, an unexpected error occurred.
          </p>

          {/* ─── TEMPORARY: show the real error for debugging ─── */}
          <div className="mb-4 max-w-2xl w-full text-left bg-red-50 border border-red-200 rounded-lg p-4 text-xs text-red-800 overflow-auto">
            <p className="font-bold mb-1">Error message:</p>
            <p className="mb-3 whitespace-pre-wrap break-words">{error?.message || "No message"}</p>
            {error?.digest && (
              <>
                <p className="font-bold mb-1">Digest:</p>
                <p className="mb-3">{error.digest}</p>
              </>
            )}
            <p className="font-bold mb-1">Stack:</p>
            <pre className="whitespace-pre-wrap break-words text-[10px]">{error?.stack || "No stack"}</pre>
          </div>

          <button
            onClick={reset}
            className="px-6 py-2 bg-zrp-red text-white rounded-full font-medium hover:bg-zrp-darkRed transition"
          >
            Try again
          </button>
          <p className="mt-4 text-xs text-gray-400">
            If the problem persists, contact support.
          </p>
        </div>
      </body>
    </html>
  );
}
