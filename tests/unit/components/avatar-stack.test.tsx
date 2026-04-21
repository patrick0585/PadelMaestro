import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvatarStack } from "@/components/ui/avatar-stack";

describe("AvatarStack", () => {
  it("renders initials for each name up to max", () => {
    render(<AvatarStack names={["Anna", "Ben", "Clara"]} max={5} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("shows a +N overflow chip when names exceed max", () => {
    render(<AvatarStack names={["Anna", "Ben", "Clara", "Daniel", "Eva", "Franz", "Greta"]} max={4} />);
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("uses names in aria-label", () => {
    render(<AvatarStack names={["Anna", "Ben"]} max={5} />);
    expect(screen.getByLabelText("Anna, Ben")).toBeInTheDocument();
  });
});
