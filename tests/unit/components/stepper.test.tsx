import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stepper } from "@/components/ui/stepper";

describe("Stepper", () => {
  it("renders the current value", () => {
    render(<Stepper value={4} onChange={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("4");
  });

  it("calls onChange with value+1 on plus", async () => {
    const handleChange = vi.fn();
    render(<Stepper value={4} onChange={handleChange} />);
    await userEvent.click(screen.getByRole("button", { name: /erhöhen/i }));
    expect(handleChange).toHaveBeenCalledWith(5);
  });

  it("calls onChange with value-1 on minus", async () => {
    const handleChange = vi.fn();
    render(<Stepper value={4} onChange={handleChange} />);
    await userEvent.click(screen.getByRole("button", { name: /verringern/i }));
    expect(handleChange).toHaveBeenCalledWith(3);
  });

  it("clamps to max", async () => {
    const handleChange = vi.fn();
    render(<Stepper value={9} max={9} onChange={handleChange} />);
    await userEvent.click(screen.getByRole("button", { name: /erhöhen/i }));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("clamps to min", async () => {
    const handleChange = vi.fn();
    render(<Stepper value={0} min={0} onChange={handleChange} />);
    await userEvent.click(screen.getByRole("button", { name: /verringern/i }));
    expect(handleChange).not.toHaveBeenCalled();
  });
});
