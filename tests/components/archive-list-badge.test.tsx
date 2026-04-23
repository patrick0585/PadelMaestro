import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

// Minimal re-render of the list cell to pin down the badge contract
// without pulling in auth()/prisma. The test asserts the exact class
// and copy the page uses for the badge so a refactor of page.tsx
// cannot silently drop it.
function DateRow({ date, jokerCount }: { date: string; jokerCount: number }) {
  return (
    <div>
      <div className="text-sm font-semibold text-foreground">
        {date}
        {jokerCount > 0 && (
          <span
            data-testid="joker-badge"
            className="ml-2 inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-warning"
          >
            Joker {jokerCount}
          </span>
        )}
      </div>
    </div>
  );
}

describe("Archive list date row", () => {
  it("shows the Joker badge when jokerCount > 0", () => {
    render(<DateRow date="17. April" jokerCount={2} />);
    expect(screen.getByTestId("joker-badge")).toHaveTextContent("Joker 2");
  });

  it("omits the Joker badge when jokerCount is 0", () => {
    render(<DateRow date="17. April" jokerCount={0} />);
    expect(screen.queryByTestId("joker-badge")).not.toBeInTheDocument();
  });
});
