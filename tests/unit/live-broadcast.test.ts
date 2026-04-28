import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  subscribeToGameDay,
  publishGameDayUpdate,
  getActiveSubscriberCount,
  __resetLiveBroadcastForTests,
} from "@/lib/game-day/live-broadcast";

describe("live-broadcast", () => {
  beforeEach(() => {
    __resetLiveBroadcastForTests();
  });

  it("delivers a published event to a single subscriber", () => {
    const listener = vi.fn();
    subscribeToGameDay("d1", listener);
    publishGameDayUpdate("d1");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("delivers a published event to every subscriber of the same game day", () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    subscribeToGameDay("d1", a);
    subscribeToGameDay("d1", b);
    subscribeToGameDay("d1", c);
    publishGameDayUpdate("d1");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it("does not deliver events from one game day to subscribers of another", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeToGameDay("d1", a);
    subscribeToGameDay("d2", b);
    publishGameDayUpdate("d1");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("stops delivering events after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToGameDay("d1", listener);
    publishGameDayUpdate("d1");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    publishGameDayUpdate("d1");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("removes the empty Set from the registry once the last listener unsubscribes", () => {
    const off = subscribeToGameDay("d1", vi.fn());
    expect(getActiveSubscriberCount("d1")).toBe(1);
    off();
    expect(getActiveSubscriberCount("d1")).toBe(0);
  });

  it("publish on a game-day with no subscribers is a no-op", () => {
    expect(() => publishGameDayUpdate("ghost")).not.toThrow();
  });

  it("a listener that throws is dropped and does not block other listeners", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    subscribeToGameDay("d1", bad);
    subscribeToGameDay("d1", good);

    publishGameDayUpdate("d1");
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);

    publishGameDayUpdate("d1");
    expect(bad).toHaveBeenCalledTimes(1); // dropped after first failure
    expect(good).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("a listener unsubscribing itself mid-publish does not skip later listeners", () => {
    const second = vi.fn();
    const first = vi.fn(() => {
      offFirst();
    });
    let offFirst = subscribeToGameDay("d1", first);
    subscribeToGameDay("d1", second);

    publishGameDayUpdate("d1");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    publishGameDayUpdate("d1");
    expect(first).toHaveBeenCalledTimes(1); // already removed
    expect(second).toHaveBeenCalledTimes(2);
  });
});
