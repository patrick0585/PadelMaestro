import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartTimeEditor } from "@/app/admin/start-time-editor";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function stubFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const bodyOf = (fn: ReturnType<typeof vi.fn>) =>
  JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("StartTimeEditor", () => {
  it("speichert eine neue Uhrzeit per PATCH", async () => {
    const fetch = stubFetch(async () => Response.json({ startTime: "19:30" }));
    render(<StartTimeEditor gameDayId="d1" startTime={null} />);

    expect(screen.queryByRole("button", { name: "Speichern" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entfernen" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Anpfiff"), "19:30");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(fetch).toHaveBeenCalledWith("/api/game-days/d1", expect.objectContaining({ method: "PATCH" }));
    expect(bodyOf(fetch)).toEqual({ startTime: "19:30" });
    expect(refresh).toHaveBeenCalled();
  });

  it("entfernt eine gesetzte Uhrzeit", async () => {
    const fetch = stubFetch(async () => Response.json({ startTime: null }));
    render(<StartTimeEditor gameDayId="d1" startTime="18:00" />);

    await userEvent.click(screen.getByRole("button", { name: "Entfernen" }));

    expect(bodyOf(fetch)).toEqual({ startTime: null });
    expect(screen.getByLabelText("Anpfiff")).toHaveValue("");
  });

  it("zeigt bei 409 einen Hinweis", async () => {
    stubFetch(async () => Response.json({ error: "locked" }, { status: 409 }));
    render(<StartTimeEditor gameDayId="d1" startTime="18:00" />);

    await userEvent.clear(screen.getByLabelText("Anpfiff"));
    await userEvent.type(screen.getByLabelText("Anpfiff"), "20:00");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Der Spieltag läuft schon");
    expect(refresh).not.toHaveBeenCalled();
  });
});
