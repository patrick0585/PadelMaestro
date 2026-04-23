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
    expect(screen.getByText(/1,64/)).toBeInTheDocument();
    expect(screen.getByText(/16,4 Punkte/)).toBeInTheDocument();
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
});
