import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";

describe("<Dialog>", () => {
  it("does not render when closed", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Test">
        <p>hidden</p>
      </Dialog>,
    );
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("renders title and children when open", () => {
    render(
      <Dialog open onClose={() => {}} title="Neuer Spieler">
        <p>visible</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Neuer Spieler" })).toBeInTheDocument();
    expect(screen.getByText("visible")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="x">
        <p>x</p>
      </Dialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on backdrop click", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="x">
        <p>x</p>
      </Dialog>,
    );
    const backdrop = screen.getByTestId("dialog-backdrop");
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when clicking inside the dialog", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="x">
        <p>inside</p>
      </Dialog>,
    );
    await userEvent.click(screen.getByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
