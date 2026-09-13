import { reconcileStuckWithdrawals } from "./withdrawals";

/*
 * ============================================================
 * The withdrawal reconciliation trigger
 * ============================================================
 *
 * Real money moves in the withdrawal approval flow (see withdrawals.ts
 * for the full crash-safety design). A withdrawal can be left
 * PROCESSING - funds already sent, or possibly never sent - if the
 * process is killed at the wrong moment (a Railway redeploy's SIGTERM,
 * a crash). Nothing else in this codebase ever revisits a PROCESSING
 * row on its own, so without this runner such a row would sit stuck
 * until an operator noticed and reconciled it by hand.
 *
 * Mirrors src/lib/news/hourly-runner.ts's pattern deliberately: the app
 * itself is the one thing guaranteed to be running, so it drives its
 * own periodic reconciliation rather than depending solely on an
 * external cron. Runs far more often than the news cycle (every 2
 * minutes, not hourly) because a stuck withdrawal is a live financial
 * inconsistency, not a content-freshness concern - the cost of raising
 * this cadence is a handful of cheap "no rows" queries per interval,
 * borne only while nothing is actually stuck.
 */

/** How often a reconciliation pass runs. */
const CYCLE_INTERVAL_MS = 2 * 60 * 1000;

/** Delay before the first pass after boot - long enough that a fresh
 * deploy is settled, short enough that a genuinely stuck withdrawal
 * from before this restart is found quickly. */
const FIRST_CYCLE_DELAY_MS = 30 * 1000;

/** Random spread so multiple replicas don't all fire in the same
 * instant - harmless either way (the distributed lock in
 * reconcileStuckWithdrawals() serializes them), just pointless
 * contention. */
const JITTER_MS = 15 * 1000;

/** Starts the periodic withdrawal reconciliation timer. Returns a
 * function that stops it. */
export function startWithdrawalReconciliation(): () => void {
  let running = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const runCycle = async () => {
    if (running) return;
    running = true;
    try {
      const results = await reconcileStuckWithdrawals();
      if (results.size > 0) {
        console.log(
          `[zrp-withdrawals] reconciliation pass touched ${results.size} stuck withdrawal(s): ${Array.from(
            results.entries()
          )
            .map(([id, outcome]) => `${id}=${outcome}`)
            .join(", ")}`
        );
      }
    } catch (error) {
      // Never take the web server down because reconciliation failed -
      // the next pass tries again, and a stuck withdrawal that's been
      // stuck for minutes can wait a few more.
      console.error("[zrp-withdrawals] reconciliation pass failed:", error);
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
