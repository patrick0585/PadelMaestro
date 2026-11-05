import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoringForm } from "@/app/admin/einstellungen/wertung/scoring-form";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function stubFetch(res: Response) {
  const fn = vi.fn(async () => res);
  vi.stubGlobal("fetch", fn);
  return fn;
}
const bodyOf = (fn: ReturnType<typeof stubFetch>) =>
  JSON.parse((fn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("ScoringForm", () => {
  it("Satz: Zähler, Beispiele und Sichern ohne Rückfrage außerhalb der Saison", async () => {
    const fetch = stubFetch(Response.json({}));
    render(<ScoringForm groupId="g" playerCount="4" initial={{ mode: "set", target: 6, max: 7 }} finishedDaysThisSeason={0} />);
    expect(screen.getByRole("radio", { name: "Satz" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("7:6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sichern" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Höchstens verringern" }));
    expect(screen.getByText(/Ohne Verlängerung/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));

    expect(bodyOf(fetch)).toEqual({ groupId: "g", playerCount: 4, rule: { mode: "set", target: 6, max: 6 } });
    expect(await screen.findByText(/Gilt ab dem nächsten Spieltag/)).toBeInTheDocument();
  });

  it("„Höchstens“ folgt „Satz bis“", async () => {
    stubFetch(Response.json({}));
    render(<ScoringForm groupId="g" playerCount="4" initial={{ mode: "set", target: 6, max: 6 }} finishedDaysThisSeason={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Satz bis erhöhen" }));
    expect(screen.getByRole("group", { name: "Höchstens" })).toHaveTextContent("7");
  });

  it("Feste Spielzahl nur ungerade, Wechsel der Wertungsart", async () => {
    const fetch = stubFetch(Response.json({}));
    render(<ScoringForm groupId="g" playerCount="5" initial={{ mode: "fixed", games: 3 }} finishedDaysThisSeason={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Spiele pro Partie erhöhen" }));
    expect(screen.getByRole("group", { name: "Spiele pro Partie" })).toHaveTextContent("5");
    await userEvent.click(screen.getByRole("radio", { name: "Satz" }));
    await userEvent.click(screen.getByRole("radio", { name: "Feste Spielzahl" }));
    expect(screen.getByRole("group", { name: "Spiele pro Partie" })).toHaveTextContent("3");
    await userEvent.click(screen.getByRole("radio", { name: "Satz" }));
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    expect(bodyOf(fetch).rule).toEqual({ mode: "set", target: 6, max: 7 });
  });

  it("mitten in der Saison: Hinweis und Rückfrage vor dem Sichern", async () => {
    const fetch = stubFetch(Response.json({}));
    render(<ScoringForm groupId="g" playerCount="6" initial={{ mode: "fixed", games: 3 }} finishedDaysThisSeason={4} />);
    await userEvent.click(screen.getByRole("button", { name: "Spiele pro Partie erhöhen" }));
    expect(screen.getByText(/Die Saison läuft schon \(4 Spieltage\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Wertung mitten in der Saison ändern?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Trotzdem ändern" }));
    expect(bodyOf(fetch).rule).toEqual({ mode: "fixed", games: 5 });
  });

  it("Fehler beim Sichern", async () => {
    stubFetch(Response.json({ error: "forbidden" }, { status: 403 }));
    render(<ScoringForm groupId="g" playerCount="5" initial={{ mode: "fixed", games: 3 }} finishedDaysThisSeason={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Spiele pro Partie erhöhen" }));
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    expect(await screen.findByText("Nur Admins dürfen die Wertung ändern.")).toBeInTheDocument();
  });
});
