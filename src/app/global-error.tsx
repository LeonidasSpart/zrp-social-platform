"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex items-center justify-center min-h-screen p-4 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Something went wrong
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              We’re sorry – an unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-zrp-red text-white rounded-lg font-medium hover:bg-zrp-darkRed transition"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
