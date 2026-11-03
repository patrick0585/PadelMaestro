import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GroupSwitcher } from "@/components/group-switcher";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const groups = [
  { id: "g1", name: "Dienstagsrunde" },
  { id: "g2", name: "Freitagsrunde" },
];

describe("<GroupSwitcher>", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    refresh.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders nothing without groups", () => {
    const { container } = render(<GroupSwitcher groups={[]} activeGroupId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the name for one group and no button", () => {
    render(<GroupSwitcher groups={[groups[0]]} activeGroupId="g1" />);
    expect(screen.getByText("Dienstagsrunde")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a menu for two groups, marks the active one, and patches then refreshes on select", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    render(<GroupSwitcher groups={groups} activeGroupId="g2" />);
    const trigger = screen.getByRole("button", { name: "Gruppe wechseln" });
    expect(trigger).toHaveTextContent("Freitagsrunde");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    const items = screen.getAllByRole("menuitemradio");
    expect(items).toHaveLength(2);
    expect(screen.getByRole("menuitemradio", { name: /Freitagsrunde/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: /Dienstagsrunde/ })).toHaveAttribute("aria-checked", "false");

    await userEvent.click(screen.getByRole("menuitemradio", { name: /Dienstagsrunde/ }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/active-group",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ groupId: "g1" }) }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("falls back to the first group's name when the active id is unknown", () => {
    render(<GroupSwitcher groups={groups} activeGroupId={null} />);
    expect(screen.getByRole("button", { name: "Gruppe wechseln" })).toHaveTextContent("Dienstagsrunde");
  });

  it("closes the menu on Escape", async () => {
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    await userEvent.click(screen.getByRole("button", { name: "Gruppe wechseln" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows an error when the patch fails", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    await userEvent.click(screen.getByRole("button", { name: "Gruppe wechseln" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Freitagsrunde/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wechsel fehlgeschlagen.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Gruppe wechseln" })).not.toBeDisabled();
  });

  it("shows an error on a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    await userEvent.click(screen.getByRole("button", { name: "Gruppe wechseln" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Freitagsrunde/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wechsel fehlgeschlagen.");
  });
});
