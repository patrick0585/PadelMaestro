import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    const trigger = screen.getByRole("button", { name: /Gruppe wechseln/ });
    expect(trigger).toHaveTextContent("Freitagsrunde");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    const items = screen.getAllByRole("menuitemradio");
    expect(items).toHaveLength(2);
    expect(screen.getByRole("menuitemradio", { name: /Freitagsrunde/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: /Dienstagsrunde/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await userEvent.click(screen.getByRole("menuitemradio", { name: /Dienstagsrunde/ }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/active-group",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ groupId: "g1" }) }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the negative margin off the trigger so the name is not cut short", () => {
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    const trigger = screen.getByRole("button", { name: /Gruppe wechseln/ });
    expect(trigger).not.toHaveClass("-ml-2");
    expect(trigger).not.toHaveClass("max-w-full");
    expect(trigger.parentElement).toHaveClass("-ml-2");
  });

  it("falls back to the first group's name when the active id is unknown", () => {
    render(<GroupSwitcher groups={groups} activeGroupId={null} />);
    expect(screen.getByRole("button", { name: /Gruppe wechseln/ })).toHaveTextContent(
      "Dienstagsrunde",
    );
  });

  it("closes the menu on Escape", async () => {
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    await userEvent.click(screen.getByRole("button", { name: /Gruppe wechseln/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows an error when the patch fails", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    await userEvent.click(screen.getByRole("button", { name: /Gruppe wechseln/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Freitagsrunde/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Gruppenwechsel fehlgeschlagen. Bitte erneut versuchen.",
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Gruppe wechseln/ })).not.toBeDisabled();
  });

  it("shows an error on a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    await userEvent.click(screen.getByRole("button", { name: /Gruppe wechseln/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Freitagsrunde/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Gruppenwechsel fehlgeschlagen. Bitte erneut versuchen.",
    );
  });

  it("labels the trigger with the action and the visible group name", () => {
    render(<GroupSwitcher groups={groups} activeGroupId="g2" />);
    expect(
      screen.getByRole("button", { name: "Gruppe wechseln: Freitagsrunde" }),
    ).toBeInTheDocument();
  });

  it("focuses the checked item on open and selects via ArrowDown and Enter", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    const trigger = screen.getByRole("button", { name: /Gruppe wechseln/ });
    await userEvent.click(trigger);
    const [first, second] = screen.getAllByRole("menuitemradio");
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");

    await userEvent.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("tabindex", "0");
    await userEvent.keyboard("{Enter}");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/active-group",
      expect.objectContaining({ body: JSON.stringify({ groupId: "g2" }) }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("wraps with the arrow keys and jumps with Home and End", async () => {
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    await userEvent.click(screen.getByRole("button", { name: /Gruppe wechseln/ }));
    const [first, second] = screen.getAllByRole("menuitemradio");
    await userEvent.keyboard("{ArrowUp}");
    expect(second).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(first).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(second).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(first).toHaveFocus();
  });

  it("closes on Tab and returns focus to the trigger on Escape and outside click", async () => {
    render(
      <>
        <GroupSwitcher groups={groups} activeGroupId="g1" />
        <p>draußen</p>
      </>,
    );
    const trigger = screen.getByRole("button", { name: /Gruppe wechseln/ });
    await userEvent.click(trigger);
    await userEvent.tab();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    await userEvent.click(screen.getByText("draußen"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not patch when the active group is selected again", async () => {
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    await userEvent.click(screen.getByRole("button", { name: /Gruppe wechseln/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Dienstagsrunde/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("patches the fallback group when no active id matches", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    render(<GroupSwitcher groups={groups} activeGroupId={null} />);
    await userEvent.click(screen.getByRole("button", { name: /Gruppe wechseln/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Dienstagsrunde/ }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/active-group",
      expect.objectContaining({ body: JSON.stringify({ groupId: "g1" }) }),
    );
  });

  it("clears the error when the menu closes and reopens", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    const trigger = screen.getByRole("button", { name: /Gruppe wechseln/ });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Freitagsrunde/ }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(trigger);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closes when the trigger is clicked again and keeps focus on it", async () => {
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    const trigger = screen.getByRole("button", { name: /Gruppe wechseln/ });
    await userEvent.click(trigger);
    await userEvent.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  // Safari and Firefox on macOS do not focus a button on mousedown: the
  // focused item blurs with relatedTarget null before the click lands.
  it("keeps the menu open for a click on an item when mousedown blurs without a target", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    render(<GroupSwitcher groups={groups} activeGroupId="g1" />);
    await userEvent.click(screen.getByRole("button", { name: /Gruppe wechseln/ }));
    const [first, second] = screen.getAllByRole("menuitemradio");
    expect(first).toHaveFocus();

    fireEvent.mouseDown(second);
    fireEvent.blur(first, { relatedTarget: null });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseUp(second);
    fireEvent.click(second);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/active-group",
      expect.objectContaining({ body: JSON.stringify({ groupId: "g2" }) }),
    );
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });
});
