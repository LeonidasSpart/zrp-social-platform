"use client";

import ErrorBoundary from "@/components/ErrorBoundary";

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
            We're sorry – an unexpected error occurred.
          </p>
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
