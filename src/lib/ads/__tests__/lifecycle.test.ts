import { describe, it, expect } from "vitest";
import { canTransition, isTerminal, SERVABLE_STATUS, TERMINAL_STATUSES } from "../lifecycle";

describe("ad campaign lifecycle", () => {
  it("lets an advertiser cancel from every pre-active or active/paused state", () => {
    expect(canTransition("advertiser", "PAYMENT_PENDING", "CANCELLED")).toBe(true);
    expect(canTransition("advertiser", "PAYMENT_FAILED", "CANCELLED")).toBe(true);
    expect(canTransition("advertiser", "PENDING_REVIEW", "CANCELLED")).toBe(true);
    expect(canTransition("advertiser", "ACTIVE", "CANCELLED")).toBe(true);
    expect(canTransition("advertiser", "PAUSED", "CANCELLED")).toBe(true);
  });

  it("lets an advertiser pause/resume their own active/paused campaign, nothing else", () => {
    expect(canTransition("advertiser", "ACTIVE", "PAUSED")).toBe(true);
    expect(canTransition("advertiser", "PAUSED", "ACTIVE")).toBe(true);
    expect(canTransition("advertiser", "PENDING_REVIEW", "ACTIVE")).toBe(false);
    expect(canTransition("advertiser", "SUSPENDED", "ACTIVE")).toBe(false);
  });

  it("never lets an advertiser self-approve, self-reject, or un-suspend", () => {
    expect(canTransition("advertiser", "PENDING_REVIEW", "PAYMENT_PENDING")).toBe(false);
    expect(canTransition("advertiser", "PENDING_REVIEW", "REJECTED")).toBe(false);
    expect(canTransition("advertiser", "SUSPENDED", "ACTIVE")).toBe(false);
    expect(canTransition("advertiser", "PAYMENT_PENDING", "ACTIVE")).toBe(false);
  });

  it("lets staff approve/reject pending review, and suspend/resume live campaigns", () => {
    expect(canTransition("staff", "PENDING_REVIEW", "PAYMENT_PENDING")).toBe(true);
    expect(canTransition("staff", "PENDING_REVIEW", "REJECTED")).toBe(true);
    expect(canTransition("staff", "ACTIVE", "SUSPENDED")).toBe(true);
    expect(canTransition("staff", "PAUSED", "SUSPENDED")).toBe(true);
    expect(canTransition("staff", "SUSPENDED", "ACTIVE")).toBe(true);
  });

  it("never lets staff jump straight from review to active, skipping payment", () => {
    expect(canTransition("staff", "PENDING_REVIEW", "ACTIVE")).toBe(false);
  });

  it("lets staff permanently cancel a live/paid campaign, distinct from a reversible suspend", () => {
    expect(canTransition("staff", "ACTIVE", "CANCELLED")).toBe(true);
    expect(canTransition("staff", "PAUSED", "CANCELLED")).toBe(true);
    expect(canTransition("staff", "SUSPENDED", "CANCELLED")).toBe(true);
    expect(canTransition("staff", "PAYMENT_PENDING", "CANCELLED")).toBe(true);
    expect(canTransition("staff", "PAYMENT_FAILED", "CANCELLED")).toBe(true);
  });

  it("never lets staff cancel a campaign still awaiting its first content review (reject is the right tool there)", () => {
    expect(canTransition("staff", "PENDING_REVIEW", "CANCELLED")).toBe(false);
  });

  it("only the system actor can move a campaign into ACTIVE via payment, or expire it", () => {
    expect(canTransition("system", "PAYMENT_PENDING", "ACTIVE")).toBe(true);
    expect(canTransition("system", "PAYMENT_PENDING", "PAYMENT_FAILED")).toBe(true);
    expect(canTransition("system", "PAYMENT_FAILED", "ACTIVE")).toBe(true);
    expect(canTransition("system", "ACTIVE", "COMPLETED")).toBe(true);
    expect(canTransition("system", "PAUSED", "COMPLETED")).toBe(true);
    expect(canTransition("system", "SUSPENDED", "COMPLETED")).toBe(true);
  });

  it("the system actor never approves content or cancels on someone's behalf", () => {
    expect(canTransition("system", "PENDING_REVIEW", "PAYMENT_PENDING")).toBe(false);
    expect(canTransition("system", "ACTIVE", "CANCELLED")).toBe(false);
  });

  it("rejects any transition out of a terminal status, for every actor", () => {
    for (const terminal of TERMINAL_STATUSES) {
      expect(canTransition("advertiser", terminal, "ACTIVE")).toBe(false);
      expect(canTransition("staff", terminal, "ACTIVE")).toBe(false);
      expect(canTransition("system", terminal, "ACTIVE")).toBe(false);
    }
  });

  it("classifies terminal statuses correctly", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("REJECTED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("ACTIVE")).toBe(false);
    expect(isTerminal("PAYMENT_PENDING")).toBe(false);
  });

  it("only ACTIVE is the servable status", () => {
    expect(SERVABLE_STATUS).toBe("ACTIVE");
  });
});
