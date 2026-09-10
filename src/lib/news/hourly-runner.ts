import { runPipelineCycle } from "./pipeline";

/*
 * ============================================================
 * The hourly trigger
 * ============================================================
 *
 * ZRP News needs a cycle to run every hour. The GitHub Actions
 * schedule that used to be the only trigger is best-effort and,
 * measured against this repository's own run history, delivered
 * roughly 43% of its runs - one every 4.7 hours against a two-hourly
 * schedule, with gaps up to 6.6 hours. Every other part of the
 * pipeline can be correct and a category will still sit empty if
 * nothing ran a cycle.
 *
 * The app itself already runs 24/7, so it is the one thing in the
 * system guaranteed to be awake every hour. Started from
 * instrumentation.ts; the GitHub workflow stays as a backup, which is
 * safe because the pipeline's distributed lock and per-publication
 * idempotency keys make an overlapping run a no-op rather than a
 * double post.
 *
 * Node runtime only - it holds timers across requests and reaches the
 * database - which is why it lives here rather than in
 * instrumentation.ts, whose module graph is also built for the edge.
 */

/** How often a cycle runs. */
const CYCLE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Delay before the first cycle after boot.
 *
 * Long enough that a deploy is settled and not competing with request
 * traffic during a cold start; short enough that a restart does not
 * cost most of an hour of coverage.
 */
const FIRST_CYCLE_DELAY_MS = 2 * 60 * 1000;

/**
 * Random spread added to each run.
 *
 * With more than one instance every timer would otherwise fire at the
 * same moment and all but one would do nothing but lose the lock race.
 * Harmless either way, just pointless work.
 */
const JITTER_MS = 90 * 1000;

/** Starts the hourly cycle timer. Returns a function that stops it. */
export function startHourlyNewsCycles(): () => void {
  let running = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const runCycle = async () => {
    // A cycle can outlive its interval on a slow model day. Skipping is
    // right: the next tick is only an hour away, and the distributed
    // lock would refuse a second one anyway.
    if (running) return;
    running = true;

    try {
      const result = await runPipelineCycle({ trigger: "scheduler" });

      if (result.ran) {
        console.log(
          `[zrp-news] cycle: published ${result.published}, ` +
            `stories ${result.storiesCreated}, sources ${result.sourcesFetched}`
        );
      }
    } catch (error) {
      // Never take the web server down because a news cycle failed. The
      // pipeline records its own failures; this is the last resort.
      console.error("[zrp-news] scheduled cycle failed:", error);
    } finally {
      running = false;
    }
  };

  const first = setTimeout(() => {
    void runCycle();
    interval = setInterval(() => {
      setTimeout(runCycle, Math.random() * JITTER_MS).unref();
    }, CYCLE_INTERVAL_MS);
    interval.unref();
  }, FIRST_CYCLE_DELAY_MS);
  first.unref();

  return () => {
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}
