import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GroupForm } from "@/app/gruppe/neu/group-form";

const assign = vi.fn();

function stubFetch(status: number, body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue({ status, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function submit(name: string) {
  render(<GroupForm />);
  fireEvent.change(screen.getByLabelText("Gruppenname"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Gruppe gründen" }));
}

describe("<GroupForm>", () => {
  beforeEach(() => {
    assign.mockReset();
    vi.stubGlobal("location", { ...window.location, assign });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("group form posts the name and navigates to /admin?willkommen=1 on 201", async () => {
    const fn = stubFetch(201, { id: "g1", name: "Dienstagsrunde", slug: "dienstagsrunde" });
    submit("Dienstagsrunde");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/admin?willkommen=1"));
    expect(fn).toHaveBeenCalledWith(
      "/api/groups",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Dienstagsrunde" }) }),
    );
  });

  it("group form shows founder-link copy on 403", async () => {
    stubFetch(403, { error: "no_founder_invitation" });
    submit("Dienstagsrunde");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Dafür brauchst du einen Gründer-Link.",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("group form links the length hint to the name input", () => {
    render(<GroupForm />);
    expect(screen.getByLabelText("Gruppenname")).toHaveAccessibleDescription("2 bis 40 Zeichen");
  });
});
