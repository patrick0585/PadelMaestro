import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoGroupNotice } from "@/components/no-group-notice";

describe("NoGroupNotice", () => {
  it("zeigt Überschrift, Hinweis und Link zum Profil", () => {
    render(<NoGroupNotice />);
    expect(screen.getByRole("heading", { name: "Du bist in keiner Gruppe" })).toBeInTheDocument();
    expect(screen.getByText(/Bitte einen Admin deiner Gruppe um Aufnahme/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Profil/ })).toHaveAttribute("href", "/profil");
  });
});
