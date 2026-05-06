import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RefreshButton, _formatAgeForTesting as formatAge } from "@/app/game-day/refresh-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("formatAge", () => {
  it("returns 'gerade eben' under 5 seconds", () => {
    expect(formatAge(0)).toBe("gerade eben");
    expect(formatAge(4_999)).toBe("gerade eben");
  });

  it("uses seconds between 5s and 60s", () => {
    expect(formatAge(5_000)).toBe("vor 5s");
    expect(formatAge(45_000)).toBe("vor 45s");
    expect(formatAge(59_999)).toBe("vor 59s");
  });

  it("switches to minutes from 60s onwards", () => {
    expect(formatAge(60_000)).toBe("vor 1min");
    expect(formatAge(180_000)).toBe("vor 3min");
  });
});

describe("<RefreshButton>", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T18:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in 'gerade eben' state", () => {
    render(<RefreshButton />);
    expect(screen.getByRole("button", { name: /aktualisieren/i })).toHaveTextContent(
      "gerade eben",
    );
  });

  it("triggers router.refresh and resets the age on click", () => {
    render(<RefreshButton />);
    // age the label past the 5s threshold
    act(() => {
      vi.setSystemTime(new Date("2026-05-06T18:00:30Z"));
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByRole("button")).toHaveTextContent(/vor \d+s/);
    act(() => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button")).toHaveTextContent("gerade eben");
  });

  it("ticks the label upward over time without a click", async () => {
    render(<RefreshButton />);
    await act(async () => {
      vi.setSystemTime(new Date("2026-05-06T18:01:00Z"));
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByRole("button")).toHaveTextContent("vor 1min");
  });
});
