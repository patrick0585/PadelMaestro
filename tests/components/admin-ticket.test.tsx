import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AdminTicket, AttendanceBar, attendanceCaption, countdownPill } from "@/app/admin/admin-ticket";

describe("<AttendanceBar>", () => {
  it("renders one segment per member and labels the split", () => {
    render(<AttendanceBar counts={{ confirmed: 4, declined: 1, joker: 0, pending: 3 }} />);
    const bar = screen.getByRole("img", { name: "4 zugesagt, 1 abgesagt, 3 offen" });
    expect(bar.children).toHaveLength(8);
  });

  it("gives jokers their own segment instead of counting them as open", () => {
    render(<AttendanceBar counts={{ confirmed: 4, declined: 1, joker: 1, pending: 2 }} />);
    const bar = screen.getByRole("img", { name: "4 zugesagt, 1 abgesagt, 1 Joker, 2 offen" });
    expect(bar.children).toHaveLength(8);
  });

  it("is hidden from assistive tech when a caption carries the numbers", () => {
    const { container } = render(<AttendanceBar counts={{ confirmed: 1, declined: 0, joker: 0, pending: 0 }} decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("attendanceCaption", () => {
  it("lists jokers only when present", () => {
    expect(attendanceCaption({ confirmed: 4, declined: 1, joker: 0, pending: 3 })).toBe("4 Zusagen · 3 offen · 1 Absage");
    expect(attendanceCaption({ confirmed: 1, declined: 2, joker: 1, pending: 0 })).toBe("1 Zusage · 0 offen · 2 Absagen · 1 Joker");
  });
});

describe("<AdminTicket>", () => {
  it("shows date, kickoff and pill", () => {
    render(<AdminTicket label="Spieltag" date={new Date("2026-11-07T00:00:00Z")} startTime="18:00" pill="in 2 Tagen" />);
    const ticket = screen.getByRole("region", { name: "Spieltag" });
    expect(ticket).toHaveTextContent("Sa., 7. Nov.");
    expect(ticket).toHaveTextContent("Anpfiff18:00");
    expect(ticket).toHaveTextContent("in 2 Tagen");
  });

  it("falls back to 'Kein Spieltag geplant' without a date", () => {
    render(<AdminTicket label="Nächster Spieltag" date={null} />);
    expect(screen.getByText("Kein Spieltag geplant")).toBeInTheDocument();
  });
});

describe("countdownPill", () => {
  it("counts Berlin calendar days", () => {
    expect(countdownPill(new Date("2026-11-07T00:00:00Z"), new Date("2026-11-05T12:00:00Z"))).toBe("in 2 Tagen");
    expect(countdownPill(new Date("2026-11-05T00:00:00Z"), new Date("2026-11-05T12:00:00Z"))).toBe("heute");
  });
});
