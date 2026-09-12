import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import vm from "vm";

/*
 * public/sw.js is a plain browser script (no module system, runs in the
 * ServiceWorkerGlobalScope) - it can't be `import`ed like ordinary
 * TypeScript. This loads its real source into a sandboxed vm context
 * with minimal mocks of the globals it touches (`self`, `caches`,
 * `clients`), captures the listener it registers for the real 'push'
 * event via a mocked addEventListener, and invokes that listener
 * directly - so this exercises the actual shipped file, not a
 * reimplementation of its logic.
 *
 * Regression coverage for a real bug: the push handler used to call
 * event.data.json() directly, outside any try/catch and before
 * event.waitUntil() - a payload that wasn't valid JSON threw
 * synchronously and skipped showNotification() entirely. Every push
 * event MUST result in a shown notification (browsers penalize ones
 * that don't - see the fix's own comment in sw.js) - these tests would
 * have failed against the old code, since showNotification would never
 * have been called in the malformed-payload and no-payload cases.
 */
function loadServiceWorker() {
  const source = readFileSync(path.join(__dirname, "../../../public/sw.js"), "utf-8");
  const listeners: Record<string, (event: any) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);

  const sandbox: any = {
    self: {
      addEventListener: (name: string, handler: (event: any) => void) => {
        listeners[name] = handler;
      },
      registration: { showNotification },
      skipWaiting: vi.fn(),
    },
    caches: { open: vi.fn(), keys: vi.fn().mockResolvedValue([]), match: vi.fn() },
    clients: { claim: vi.fn(), openWindow: vi.fn() },
    console: { warn: vi.fn(), error: vi.fn() },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  return { listeners, showNotification, sandbox };
}

function fireEvent(listener: (event: any) => void, event: any) {
  const waited: Promise<unknown>[] = [];
  listener({ ...event, waitUntil: (p: Promise<unknown>) => waited.push(p) });
  return Promise.all(waited);
}

describe("public/sw.js push handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a notification with the payload's title/body/url for a valid JSON push", async () => {
    const { listeners, showNotification } = loadServiceWorker();
    await fireEvent(listeners.push, {
      data: { json: () => ({ title: "New message", body: "Hi there", url: "/messages/1" }) },
    });

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(
      "New message",
      expect.objectContaining({ body: "Hi there", data: { url: "/messages/1" } })
    );
  });

  it("still shows a fallback notification when the payload is not valid JSON", async () => {
    const { listeners, showNotification } = loadServiceWorker();
    await fireEvent(listeners.push, {
      data: {
        json: () => {
          throw new SyntaxError("Unexpected token");
        },
      },
    });

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(
      "ZRP Social",
      expect.objectContaining({ body: "You have a new notification.", data: { url: "/" } })
    );
  });

  it("still shows a fallback notification when the push carries no data at all", async () => {
    const { listeners, showNotification } = loadServiceWorker();
    await fireEvent(listeners.push, { data: null });

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(
      "ZRP Social",
      expect.objectContaining({ body: "You have a new notification.", data: { url: "/" } })
    );
  });
});
