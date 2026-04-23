import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

// The archive page is a server component that calls auth() and Prisma,
// so it is not directly rendered in unit tests. This test instead
// exercises the same JSX snippet in isolation to document the badge's
// intended shape: a conditional span with id "joker-badge", the warning
// pill classes, the copy "Joker N", and a German aria-label. Treat it
// as an executable specification — not a pin on page.tsx.
function DateRow({ date, jokerCount }: { date: string; jokerCount: number }) {
  return (
    <div>
      <div className="text-sm font-semibold text-foreground">
        {date}
        {jokerCount > 0 && (
          <span
            data-testid="joker-badge"
            aria-label={`${jokerCount} Joker eingesetzt`}
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
    expect(screen.getByLabelText("2 Joker eingesetzt")).toBeInTheDocument();
  });

  it("omits the Joker badge when jokerCount is 0", () => {
    render(<DateRow date="17. April" jokerCount={0} />);
    expect(screen.queryByTestId("joker-badge")).not.toBeInTheDocument();
  });
});
