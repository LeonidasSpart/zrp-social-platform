import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const runPipelineCycle = vi.hoisted(() => vi.fn());
vi.mock("../pipeline", () => ({ runPipelineCycle }));

import { startHourlyNewsCycles } from "../hourly-runner";

/*
 * The app's own hourly timer is the trigger ZRP News actually relies
 * on: GitHub's scheduled workflows delivered roughly 43% of their runs
 * in this repository's history, and every other part of the pipeline
 * can be correct while a category sits empty because nothing ran a
 * cycle.
 *
 * A timer living inside the web server also has to be the kind of
 * thing that never wedges, never doubles up, and never takes the
 * server down with it.
 */
describe("the hourly news runner", () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    runPipelineCycle.mockReset();
    runPipelineCycle.mockResolvedValue({
      ran: true, published: 0, storiesCreated: 0, sourcesFetched: 0,
    });
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
  });

  it("runs a cycle on its own, with nothing triggering it", async () => {
    stop = startHourlyNewsCycles();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(runPipelineCycle).toHaveBeenCalledTimes(1);
    // Recorded distinctly from the GitHub workflow and from an admin's
    // manual run, so it is always clear what triggered a cycle.
    expect(runPipelineCycle).toHaveBeenCalledWith({ trigger: "scheduler" });
  });

  it("keeps running every hour, which is the whole point", async () => {
    stop = startHourlyNewsCycles();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(runPipelineCycle).toHaveBeenCalledTimes(1);

    for (let hour = 0; hour < 4; hour += 1) {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    }
    expect(runPipelineCycle).toHaveBeenCalledTimes(5);
  });

  it("never starts a second cycle while one is still running", async () => {
    let release: (() => void) | null = null;
    runPipelineCycle.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ ran: true, published: 0, storiesCreated: 0, sourcesFetched: 0 });
        })
    );

    stop = startHourlyNewsCycles();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(runPipelineCycle).toHaveBeenCalledTimes(1);

    // A cycle can outrun its interval on a slow model day.
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
    expect(runPipelineCycle).toHaveBeenCalledTimes(1);

    release!();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(runPipelineCycle).toHaveBeenCalledTimes(2);
  });

  it("survives a cycle that throws, and tries again next hour", async () => {
    runPipelineCycle.mockRejectedValueOnce(new Error("model provider is down"));

    stop = startHourlyNewsCycles();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(runPipelineCycle).toHaveBeenCalledTimes(1);

    // A failed cycle must not stop the clock - or take the web server
    // down with it.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(runPipelineCycle).toHaveBeenCalledTimes(2);
  });

  it("stops when told to", async () => {
    const halt = startHourlyNewsCycles();
    halt();

    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(runPipelineCycle).not.toHaveBeenCalled();
  });
});
