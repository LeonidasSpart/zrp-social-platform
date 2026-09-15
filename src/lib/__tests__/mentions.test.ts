import { describe, it, expect } from "vitest";
import { extractMentionedUsernames } from "../mentions";

describe("extractMentionedUsernames", () => {
  it("extracts a single @username without the @", () => {
    expect(extractMentionedUsernames("hey @alice check this out")).toEqual(["alice"]);
  });

  it("extracts multiple distinct usernames", () => {
    expect(extractMentionedUsernames("cc @alice @bob and @carol")).toEqual(["alice", "bob", "carol"]);
  });

  it("dedupes the same username mentioned twice, case-insensitively", () => {
    expect(extractMentionedUsernames("@Alice thanks @alice!")).toEqual(["alice"]);
  });

  it("returns an empty array for content with no mentions", () => {
    expect(extractMentionedUsernames("just a normal post, no mentions here")).toEqual([]);
  });

  it("does not treat an email-like string as a mention beyond the local part", () => {
    // Matches the existing @username parsing convention used elsewhere
    // in the codebase (post creation) - not scoped to fix email-address
    // false positives, just documenting the current, shared behavior.
    expect(extractMentionedUsernames("contact me at user@example.com")).toEqual(["example"]);
  });
});
