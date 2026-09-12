import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks the actual network boundary (UTApi.deleteFiles) so these are pure
// unit tests with no real UploadThing/DB access, and so each test can make
// deleteFiles behave per-key (success/failure/throw) to exercise the retry
// logic precisely - something a single aggregate mock return value can't do,
// since the real UTApi.deleteFiles response ({ success, deletedCount }) has
// no per-key breakdown either (see the comment above deleteUploadThingKeys).
const { deleteFiles } = vi.hoisted(() => ({ deleteFiles: vi.fn() }));
vi.mock("uploadthing/server", () => ({
  UTApi: vi.fn().mockImplementation(function UTApiMock(this: { deleteFiles: typeof deleteFiles }) {
    this.deleteFiles = deleteFiles;
  }),
  UploadThingError: class UploadThingError extends Error {},
}));

import { deleteUploadThingKeys, deleteUploadThingFiles } from "../uploadthing";

function alwaysSucceeds() {
  deleteFiles.mockImplementation(async (keys: string[]) => ({ success: true, deletedCount: keys.length }));
}

describe("deleteUploadThingKeys", () => {
  beforeEach(() => {
    deleteFiles.mockReset();
  });

  it("TEST 1: the same key sent twice is only ever handed to UploadThing once", async () => {
    alwaysSucceeds();
    const result = await deleteUploadThingKeys(["A", "A"]);
    expect(deleteFiles).toHaveBeenCalledTimes(1);
    expect(deleteFiles).toHaveBeenCalledWith(["A"]);
    expect(result).toEqual({ requested: 2, unique: 1, deleted: 1, failed: 0, retried: 0 });
  });

  it("TEST 2: ['A','B','A','C','B'] resolves to exactly A, B, C", async () => {
    alwaysSucceeds();
    const result = await deleteUploadThingKeys(["A", "B", "A", "C", "B"]);
    const sent = deleteFiles.mock.calls.map((c) => c[0][0]).sort();
    expect(sent).toEqual(["A", "B", "C"]);
    expect(result).toEqual({ requested: 5, unique: 3, deleted: 3, failed: 0, retried: 0 });
  });

  it("TEST 3: A succeeds and B fails -> B is retried, A is never called again", async () => {
    deleteFiles.mockImplementation(async (keys: string[]) =>
      keys[0] === "B" ? { success: false, deletedCount: 0 } : { success: true, deletedCount: 1 }
    );

    const result = await deleteUploadThingKeys(["A", "B"]);

    const aCalls = deleteFiles.mock.calls.filter((c) => c[0][0] === "A").length;
    const bCalls = deleteFiles.mock.calls.filter((c) => c[0][0] === "B").length;
    expect(aCalls).toBe(1); // succeeded on the first attempt - never retried
    expect(bCalls).toBe(2); // failed once, retried exactly once
    expect(result).toEqual({ requested: 2, unique: 2, deleted: 1, failed: 1, retried: 1 });
  });

  it("TEST 4: a key that fails once then succeeds on retry ends with an empty failure list", async () => {
    let bAttempts = 0;
    deleteFiles.mockImplementation(async (keys: string[]) => {
      if (keys[0] !== "B") return { success: true, deletedCount: 1 };
      bAttempts++;
      return bAttempts > 1 ? { success: true, deletedCount: 1 } : { success: false, deletedCount: 0 };
    });

    const result = await deleteUploadThingKeys(["A", "B"]);
    expect(result.failed).toBe(0);
    expect(result.deleted).toBe(2);
    expect(result.retried).toBe(1);
  });

  it("TEST 5: a key that keeps failing through the retry is the only one reported failed", async () => {
    deleteFiles.mockImplementation(async (keys: string[]) =>
      keys[0] === "B" ? { success: false, deletedCount: 0 } : { success: true, deletedCount: 1 }
    );

    const result = await deleteUploadThingKeys(["A", "B", "C"]);
    expect(result.deleted).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.retried).toBe(1);
  });

  it("TEST 6: null/undefined/empty values are dropped - only real keys reach UploadThing", async () => {
    alwaysSucceeds();
    await deleteUploadThingKeys([null as unknown as string, undefined as unknown as string, "", "A"]);
    expect(deleteFiles).toHaveBeenCalledTimes(1);
    expect(deleteFiles).toHaveBeenCalledWith(["A"]);
  });

  it("does not mutate the caller's original array", async () => {
    alwaysSucceeds();
    const original = ["A", "A", "B"];
    const snapshot = [...original];
    await deleteUploadThingKeys(original);
    expect(original).toEqual(snapshot);
  });

  it("TEST 8: two distinct keys are both deleted", async () => {
    alwaysSucceeds();
    const result = await deleteUploadThingKeys(["A", "B"]);
    expect(result.deleted).toBe(2);
    expect(deleteFiles).toHaveBeenCalledWith(["A"]);
    expect(deleteFiles).toHaveBeenCalledWith(["B"]);
  });

  it("TEST 10: a deletedCount of 0 is never treated as a confirmed deletion, even with success:true (not-found/already-deleted semantics can't be told apart from a real failure at this SDK's contract - see DeleteFileResponse) - and a repeat invocation stays safe", async () => {
    deleteFiles.mockImplementation(async () => ({ success: true, deletedCount: 0 }));
    const result = await deleteUploadThingKeys(["A"]);
    expect(result.failed).toBe(1);
    expect(result.deleted).toBe(0);

    // Idempotency: calling again (e.g. a duplicate cleanup invocation) must
    // not throw or corrupt anything - it just reports the same outcome.
    await expect(deleteUploadThingKeys(["A"])).resolves.toEqual(
      expect.objectContaining({ failed: 1, deleted: 0 })
    );
  });

  it("never throws even when UTApi itself throws on every call", async () => {
    deleteFiles.mockRejectedValue(new Error("network down"));
    await expect(deleteUploadThingKeys(["A"])).resolves.toEqual(
      expect.objectContaining({ deleted: 0, failed: 1 })
    );
  });

  it("an empty/all-invalid list returns immediately without calling UploadThing", async () => {
    const result = await deleteUploadThingKeys([]);
    expect(result).toEqual({ requested: 0, unique: 0, deleted: 0, failed: 0, retried: 0 });
    expect(deleteFiles).not.toHaveBeenCalled();
  });
});

describe("deleteUploadThingFiles", () => {
  beforeEach(() => {
    deleteFiles.mockReset();
  });

  it("TEST 7 (repeated invocation): extracts keys from URLs and dedupes overlapping URLs pointing at the same key, ignoring null/undefined", async () => {
    alwaysSucceeds();
    await deleteUploadThingFiles([
      "https://utfs.io/f/sameKey",
      "https://utfs.io/f/sameKey",
      null,
      undefined,
    ]);
    expect(deleteFiles).toHaveBeenCalledTimes(1);
    expect(deleteFiles).toHaveBeenCalledWith(["sameKey"]);

    // Calling it again with the exact same input is safe and produces the
    // exact same outcome - no cross-invocation state, no double counting.
    deleteFiles.mockClear();
    await deleteUploadThingFiles(["https://utfs.io/f/sameKey", "https://utfs.io/f/sameKey"]);
    expect(deleteFiles).toHaveBeenCalledTimes(1);
    expect(deleteFiles).toHaveBeenCalledWith(["sameKey"]);
  });

  it("TEST 8: two distinct files, both from different URLs, are both deleted", async () => {
    alwaysSucceeds();
    await deleteUploadThingFiles(["https://utfs.io/f/keyA", "https://utfs.io/f/keyB"]);
    expect(deleteFiles).toHaveBeenCalledWith(["keyA"]);
    expect(deleteFiles).toHaveBeenCalledWith(["keyB"]);
  });
});
