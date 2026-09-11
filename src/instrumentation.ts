/*
 * ============================================================
 * Server startup hooks
 * ============================================================
 *
 * Next.js runs `register()` once when the server boots, including
 * behind the custom server in server.js (which calls app.prepare()).
 *
 * This module's graph is built for the edge runtime as well as Node,
 * so anything that touches Prisma, sockets or timers has to stay
 * behind the NEXT_RUNTIME check below and be reached by a dynamic
 * import - a static one would drag `dns` and `crypto` into the edge
 * bundle and fail the build.
 */

/**
 * Whether the app should run ZRP News cycles itself.
 *
 * On in production, because the GitHub Actions schedule alone does not
 * deliver an hourly cycle (see hourly-runner.ts). Off outside
 * production so `npm run dev` does not start fetching live feeds and
 * spending model calls in the background.
 *
 * NEWS_SCHEDULER=off is the production kill switch and NEWS_SCHEDULER=on
 * enables it locally. Independent of the automation pause in
 * /admin/news-network, which still stops anything being published at
 * all.
 */
function newsSchedulerEnabled(): boolean {
  // `next build` also runs with NODE_ENV=production. Next does not call
  // register() during a build, but a timer started inside a build would
  // be silent and awkward to diagnose, so this is not left to trust.
  if (process.env.NEXT_PHASE === "phase-production-build") return false;

  const setting = process.env.NEWS_SCHEDULER;
  if (setting === "on") return true;
  if (setting === "off") return false;
  return process.env.NODE_ENV === "production";
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && newsSchedulerEnabled()) {
    const { startHourlyNewsCycles } = await import("@/lib/news/hourly-runner");
    startHourlyNewsCycles();
  }
}

// Required by @sentry/nextjs so errors thrown in nested React Server
// Components reach Sentry - without it those errors were silently
// dropped instead of going through the scrubbing in sentry.server.config.ts
// / sentry.edge.config.ts. See src/lib/sentry-scrub.ts.
export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
