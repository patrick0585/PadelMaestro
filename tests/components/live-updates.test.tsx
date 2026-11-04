import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GameDayLiveUpdates } from "@/app/game-day/live-updates";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

class FakeEventSource {
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 0;
  closed = false;
  private handlers = new Map<string, Set<() => void>>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.handlers.get(type)?.delete(fn);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
  emit(type: string) {
    if (type === "open") this.readyState = 1;
    for (const fn of this.handlers.get(type) ?? []) fn();
  }
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const latest = () => FakeEventSource.instances[FakeEventSource.instances.length - 1];

describe("<GameDayLiveUpdates>", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refreshes on a server update", () => {
    render(<GameDayLiveUpdates gameDayId="d1" />);
    expect(latest().url).toBe("/api/game-day/d1/events");
    act(() => latest().emit("open"));
    expect(refresh).not.toHaveBeenCalled();
    act(() => latest().emit("update"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("closes in the background and refreshes plus reconnects when visible again", () => {
    render(<GameDayLiveUpdates gameDayId="d1" />);
    const first = latest();
    setVisibility("hidden");
    expect(first.closed).toBe(true);
    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(latest().closed).toBe(false);
    act(() => latest().emit("open"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("opens nothing while mounted hidden, exactly one connection once visible", () => {
    setVisibility("hidden");
    render(<GameDayLiveUpdates gameDayId="d1" />);
    expect(FakeEventSource.instances).toHaveLength(0);
    setVisibility("visible");
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("leaves a transient error to the browser's own retry", () => {
    render(<GameDayLiveUpdates gameDayId="d1" />);
    act(() => latest().emit("error"));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("cancels a pending reopen when going hidden, and reconnects once on return", () => {
    render(<GameDayLiveUpdates gameDayId="d1" />);
    act(() => {
      latest().readyState = FakeEventSource.CLOSED;
      latest().emit("error");
    });
    setVisibility("hidden");
    setVisibility("visible");
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it("backs off between failed reopens and resets after a successful open", () => {
    render(<GameDayLiveUpdates gameDayId="d1" />);
    const fail = () =>
      act(() => {
        latest().readyState = FakeEventSource.CLOSED;
        latest().emit("error");
      });
    const advance = (ms: number) =>
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    fail();
    advance(5_000);
    expect(FakeEventSource.instances).toHaveLength(2);
    fail();
    advance(9_999);
    expect(FakeEventSource.instances).toHaveLength(2);
    advance(1);
    expect(FakeEventSource.instances).toHaveLength(3);
    act(() => latest().emit("open"));
    fail();
    advance(5_000);
    expect(FakeEventSource.instances).toHaveLength(4);
  });

  it("refreshes after an automatic reconnect to catch missed updates", () => {
    render(<GameDayLiveUpdates gameDayId="d1" />);
    act(() => latest().emit("open"));
    act(() => latest().emit("error"));
    act(() => latest().emit("open"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reopens a connection the browser gave up on", () => {
    render(<GameDayLiveUpdates gameDayId="d1" />);
    const first = latest();
    act(() => {
      first.readyState = FakeEventSource.CLOSED;
      first.emit("error");
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
    act(() => latest().emit("open"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not reopen while hidden and cleans up on unmount", () => {
    const { unmount } = render(<GameDayLiveUpdates gameDayId="d1" />);
    setVisibility("hidden");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    setVisibility("visible");
    unmount();
    expect(latest().closed).toBe(true);
    setVisibility("hidden");
    setVisibility("visible");
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});
