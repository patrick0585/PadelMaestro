import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "@/components/ui/avatar";

describe("Avatar", () => {
  it("shows initials when avatarVersion is 0", () => {
    render(<Avatar playerId="abc" name="Patrick Berger" avatarVersion={0} />);
    expect(screen.getByText("PB")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders an img with versioned src when avatarVersion > 0", () => {
    render(<Avatar playerId="abc" name="Patrick Berger" avatarVersion={3} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/api/players/abc/avatar?v=3");
    expect(img).toHaveAttribute("alt", "Patrick Berger");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("respects the size prop on the fallback", () => {
    const { container } = render(
      <Avatar playerId="abc" name="Patrick Berger" avatarVersion={0} size={96} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/h-24/);
    expect(root.className).toMatch(/w-24/);
  });
});
