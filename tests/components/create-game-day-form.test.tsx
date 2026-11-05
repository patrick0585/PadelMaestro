import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateGameDayForm } from "@/app/admin/create-game-day-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

function stubFetch() {
  const fn = vi.fn(async () => Response.json({ gameDay: { id: "d1" } }, { status: 201 }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const bodyOf = (fn: ReturnType<typeof stubFetch>) =>
  JSON.parse((fn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

async function openForm() {
  render(<CreateGameDayForm />);
  await userEvent.click(screen.getByTestId("create-game-day"));
  await userEvent.type(screen.getByLabelText("Datum"), "2026-11-12");
}

describe("CreateGameDayForm", () => {
  it("schickt den Anpfiff mit", async () => {
    const fetch = stubFetch();
    await openForm();
    await userEvent.type(screen.getByLabelText("Anpfiff"), "18:00");
    await userEvent.click(screen.getByTestId("create-game-day-submit"));
    expect(bodyOf(fetch)).toEqual({ date: "2026-11-12", startTime: "18:00" });
    expect(push).toHaveBeenCalledWith("/admin/spieltage/d1");
  });

  it("schickt null, wenn kein Anpfiff gesetzt ist", async () => {
    const fetch = stubFetch();
    await openForm();
    await userEvent.click(screen.getByTestId("create-game-day-submit"));
    expect(bodyOf(fetch)).toEqual({ date: "2026-11-12", startTime: null });
  });

  it("kündigt Fehler für Screenreader an", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "date_exists" }, { status: 409 })));
    await openForm();
    await userEvent.click(screen.getByTestId("create-game-day-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent("existiert bereits");
  });
});
