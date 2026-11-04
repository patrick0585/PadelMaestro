import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LargeTitle, PrimaryAction, ListRow, GroupedList } from "@/components/ui/list";

describe("list primitives", () => {
  it("renders a back link to the parent route", () => {
    render(<LargeTitle title="Spieler" back={{ href: "/admin", label: "Verwaltung" }} />);
    const link = screen.getByRole("link", { name: "Verwaltung" });
    expect(link).toHaveAttribute("href", "/admin");
  });

  it("renders a row as link with chevron and value", () => {
    render(
      <GroupedList>
        <ListRow href="/admin/spieler" title="Spieler" value="6" chevron />
      </GroupedList>,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/spieler");
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("›")).toBeInTheDocument();
  });

  it("renders a destructive centered row as button", () => {
    const onClick = vi.fn();
    render(<ListRow onClick={onClick} title="Löschen" tone="destructive" align="center" />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("text-destructive");
    expect(btn.className).toContain("justify-center");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("truncates long titles", () => {
    render(<ListRow title="Ein sehr langer Titel" value="12" />);
    expect(screen.getByText("Ein sehr langer Titel").className).toContain("truncate");
    expect(screen.getByText("12").className).toContain("shrink-0");
  });

  it("renders PrimaryAction as submit and disabled button", () => {
    render(
      <PrimaryAction type="submit" disabled>
        Speichern
      </PrimaryAction>,
    );
    const btn = screen.getByRole("button", { name: "Speichern" });
    expect(btn).toHaveAttribute("type", "submit");
    expect(btn).toBeDisabled();
  });
});
