import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NoGroupNotice } from "@/components/no-group-notice";

describe("NoGroupNotice", () => {
  it("NoGroupNotice shows the found-group link only when canFound", () => {
    const { unmount } = render(<NoGroupNotice canFound={true} />);
    expect(screen.getByText("Du hast einen Gründer-Link eingelöst.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gruppe gründen" })).toHaveAttribute("href", "/gruppe/neu");
    unmount();

    render(<NoGroupNotice canFound={false} />);
    expect(screen.queryByRole("link", { name: "Gruppe gründen" })).not.toBeInTheDocument();
    expect(screen.getByText("Bitte einen Admin um Aufnahme in eine Gruppe.")).toBeInTheDocument();
  });
});
