import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Button } from "@/components/ui/button";

describe("<Button>", () => {
  it("renders children", () => {
    render(<Button>Speichern</Button>);
    expect(screen.getByRole("button", { name: "Speichern" })).toBeInTheDocument();
  });

  it("applies the primary variant by default", () => {
    render(<Button>Los</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/cta-gradient/);
  });

  it("applies the ghost variant when asked", () => {
    render(<Button variant="ghost">Abbrechen</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).not.toMatch(/bg-primary/);
  });

  it("disables the button while loading and shows a spinner marker", () => {
    render(<Button loading>Speichern</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("…");
  });

  it("invokes onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Klick</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
