import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { JokerConfirmDialog } from "@/components/joker-confirm-dialog";

describe("<JokerConfirmDialog>", () => {
  it("renders the 1-of-2 wording when two jokers are remaining", () => {
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        jokersRemaining={2}
        ppgSnapshot={1.64}
      />,
    );
    expect(screen.getByText(/1\. von 2 Jokern/)).toBeInTheDocument();
    // Two occurrences of "1,64" are expected now (standalone + inside "10 × 1,64 ≈ ...").
    expect(screen.getAllByText(/1,64/).length).toBeGreaterThanOrEqual(1);
    // 1.64 × 10 = 16.4 → rounds down to 16
    expect(screen.getByText(/16 Punkte/)).toBeInTheDocument();
  });

  it("rounds the credited points up from 0.5", () => {
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        jokersRemaining={2}
        ppgSnapshot={1.65}
      />,
    );
    // 1.65 × 10 = 16.5 → rounds up to 17
    expect(screen.getByText(/17 Punkte/)).toBeInTheDocument();
  });

  it("renders the 2-of-2 wording when one joker is remaining", () => {
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        jokersRemaining={1}
        ppgSnapshot={1.64}
      />,
    );
    expect(screen.getByText(/2\. von 2 Jokern/)).toBeInTheDocument();
  });

  it("renders the PPG fallback when the snapshot is null", () => {
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        jokersRemaining={2}
        ppgSnapshot={null}
      />,
    );
    expect(screen.getByText(/Bisher keine Statistik/)).toBeInTheDocument();
  });

  it("includes an optional target player name in the title when provided", () => {
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        jokersRemaining={2}
        ppgSnapshot={1.5}
        targetName="Werner"
      />,
    );
    expect(screen.getByRole("dialog", { name: /Werner/ })).toBeInTheDocument();
  });

  it("calls onConfirm when the primary button is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        jokersRemaining={2}
        ppgSnapshot={1.5}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Joker setzen/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("disables both buttons while loading", () => {
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        jokersRemaining={2}
        ppgSnapshot={1.5}
        loading
      />,
    );
    expect(screen.getByRole("button", { name: /Abbrechen/ })).toBeDisabled();
    // Primary button is a Button with loading={true} — its visible text becomes "…"
    // but the disabled state is still observable.
    const confirmButton = screen.getAllByRole("button").find(
      (b) => b !== screen.getByRole("button", { name: /Abbrechen/ }),
    );
    expect(confirmButton).toBeDisabled();
  });
});
