import { render, screen, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoreEditor, germanInvalidReason, type EditableMatch } from "@/app/game-day/score-editor";
import { CurrentMatch } from "@/app/game-day/current-match";
import { MatchRows, requestOpenMatch, type RowMatch } from "@/app/game-day/match-rows";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const match: EditableMatch = {
  id: "m4",
  matchNumber: 4,
  team1: ["Ben", "Anna"],
  team2: ["Patrick", "Eva"],
  team1Score: null,
  team2Score: null,
  version: 0,
};

function stubFetch(res: Response) {
  const fn = vi.fn(async () => res);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  refresh.mockClear();
});

async function score(a: number, b: number) {
  for (let i = 0; i < a; i++) await userEvent.click(screen.getByRole("button", { name: "Punkt für Ben & Anna hinzufügen" }));
  for (let i = 0; i < b; i++) await userEvent.click(screen.getByRole("button", { name: "Punkt für Patrick & Eva hinzufügen" }));
}

describe("ScoreEditor", () => {
  it("Speichern erst bei gültigem Ergebnis, schickt Stand und Version", async () => {
    const fetch = stubFetch(Response.json({}));
    render(<ScoreEditor match={match} playerCount={6} size="hero" />);
    expect(screen.getByText("Summe 3: 3:0, 2:1, 1:2 oder 0:3")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Speichern" });
    expect(save).toBeDisabled();
    await score(2, 1);
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 2:1" }));
    expect(fetch).toHaveBeenCalledWith("/api/matches/m4", expect.objectContaining({ method: "PUT" }));
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      team1Score: 2,
      team2Score: 1,
      expectedVersion: 0,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("Summe 3: Plus sperrt, sobald die Summe erreicht ist (kein 2:3)", async () => {
    render(<ScoreEditor match={match} playerCount={6} size="hero" />);
    await score(2, 1);
    expect(screen.getByRole("button", { name: "Punkt für Ben & Anna hinzufügen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Punkt für Patrick & Eva hinzufügen" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Punkt für Ben & Anna entfernen" }));
    expect(screen.getByRole("button", { name: "Punkt für Patrick & Eva hinzufügen" })).toBeEnabled();
  });

  it("4 Spieler: 7:6 ist gültig, 5:3 nicht; Obergrenze greift", async () => {
    stubFetch(Response.json({}));
    render(<ScoreEditor match={match} playerCount={4} size="row" />);
    await score(5, 3);
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
    await score(2, 3);
    expect(screen.getByRole("button", { name: "Speichern · 7:6" })).toBeEnabled();
  });

  it("übernimmt fremde Änderungen, solange nichts angetippt wurde", async () => {
    const fetch = stubFetch(Response.json({}));
    const scored = { ...match, team1Score: 2, team2Score: 1, version: 1 };
    const { rerender } = render(<ScoreEditor match={scored} playerCount={6} size="row" />);
    rerender(<ScoreEditor match={{ ...scored, team1Score: 3, team2Score: 0, version: 2 }} playerCount={6} size="row" />);
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 3:0" }));
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).expectedVersion).toBe(2);
  });

  it("nach eigenem Antippen bleibt die alte Version, damit der Server den Konflikt meldet", async () => {
    const fetch = stubFetch(Response.json({}, { status: 409 }));
    const scored = { ...match, team1Score: 2, team2Score: 1, version: 1 };
    const { rerender } = render(<ScoreEditor match={scored} playerCount={6} size="row" />);
    await userEvent.click(screen.getByRole("button", { name: "Punkt für Ben & Anna entfernen" }));
    await userEvent.click(screen.getByRole("button", { name: "Punkt für Ben & Anna entfernen" }));
    await userEvent.click(screen.getByRole("button", { name: "Punkt für Patrick & Eva hinzufügen" }));
    await userEvent.click(screen.getByRole("button", { name: "Punkt für Patrick & Eva hinzufügen" }));
    rerender(<ScoreEditor match={{ ...scored, team1Score: 3, team2Score: 0, version: 2 }} playerCount={6} size="row" />);
    expect(screen.getByRole("button", { name: "Speichern · 0:3" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 0:3" }));
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).expectedVersion).toBe(1);
    expect(await screen.findByRole("alert")).toHaveTextContent("Zwischenzeitlich geändert");
  });

  it("nach erfolgreichem Speichern kein zweites Absenden", async () => {
    const fetch = stubFetch(Response.json({}));
    render(<ScoreEditor match={match} playerCount={6} size="hero" />);
    await score(2, 1);
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 2:1" }));
    const btn = screen.getByRole("button", { name: /Speichern|…/ });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("ungültiger Stand: Hinweis sagt warum", async () => {
    render(<ScoreEditor match={match} playerCount={6} size="hero" />);
    await score(1, 1);
    expect(screen.getByText("Summe muss 3 sein (jetzt 2)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speichern" })).toHaveAccessibleDescription("Summe muss 3 sein (jetzt 2)");
  });

  it("zeigt Konflikt-Fehler", async () => {
    stubFetch(Response.json({}, { status: 409 }));
    render(<ScoreEditor match={match} playerCount={6} size="hero" />);
    await score(3, 0);
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 3:0" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Zwischenzeitlich geändert");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("CurrentMatch", () => {
  const segments = ["done", "done", "done", "current", "open"] as const;

  it("Fortschritt, Eingabe und Hinweis aufs nächste Match", () => {
    render(<CurrentMatch current={match} segments={[...segments]} playerCount={6} canEdit nextLabel="Danach: Match 5 · du spielst" />);
    expect(screen.getByText("Match 4 von 5")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Ergebnis Match 4" })).toBeInTheDocument();
    expect(screen.getByText("Danach: Match 5 · du spielst")).toBeInTheDocument();
  });

  it("ohne Eintragsrecht nur die Paarung", () => {
    render(<CurrentMatch current={match} segments={[...segments]} playerCount={6} canEdit={false} nextLabel={null} />);
    expect(screen.queryByRole("group", { name: "Ergebnis Match 4" })).not.toBeInTheDocument();
    expect(screen.getByText(/Ben & Anna/)).toBeInTheDocument();
  });

  it("nach dem Speichern: Hinweis mit Korrigieren, der das Match in der Liste öffnet", async () => {
    stubFetch(Response.json({}));
    Element.prototype.scrollIntoView = vi.fn();
    const scoredRow: RowMatch = { ...match, team1Score: 1, team2Score: 2, version: 1, scoredByName: null, scoredAt: null, removable: false };
    const { rerender } = render(
      <>
        <CurrentMatch current={match} segments={[...segments]} playerCount={6} canEdit nextLabel={null} />
        <MatchRows matches={[]} playerCount={6} canEdit gameDayId="d" myName={null} />
      </>,
    );
    await score(1, 2);
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 1:2" }));
    const toast = await screen.findByText(/Match 4: 1:2/);
    expect(toast.closest("[role=status]")).toHaveTextContent("für Patrick & Eva");
    await userEvent.click(screen.getByRole("button", { name: "Korrigieren" }));
    // Das Match taucht erst nach dem Neuladen in „Gewertet“ auf.
    rerender(
      <>
        <CurrentMatch current={null} segments={[...segments]} playerCount={6} canEdit nextLabel={null} />
        <MatchRows matches={[scoredRow]} playerCount={6} canEdit gameDayId="d" myName={null} />
      </>,
    );
    expect(screen.getByRole("button", { name: /Match 4.*korrigieren/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("alle gewertet", () => {
    render(<CurrentMatch current={null} segments={["done", "done"]} playerCount={6} canEdit nextLabel={null} />);
    expect(screen.getByText("Alle 2 Matches gewertet")).toBeInTheDocument();
  });
});

describe("MatchRows", () => {
  const row = (over: Partial<RowMatch>): RowMatch => ({
    ...match,
    id: "r1",
    matchNumber: 1,
    scoredByName: null,
    scoredAt: null,
    removable: false,
    ...over,
  });

  it("Antippen öffnet die Eingabe in der Zeile, eigener Name hervorgehoben", async () => {
    render(<MatchRows matches={[row({ team1Score: 2, team2Score: 1 })]} playerCount={6} canEdit gameDayId="d" myName="Patrick" />);
    expect(screen.getByText("Patrick").className).toContain("text-primary");
    await userEvent.click(screen.getByRole("button", { name: "Match 1, Ben & Anna gegen Patrick & Eva, 2:1, korrigieren" }));
    expect(screen.getByRole("button", { name: "Speichern · 2:1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("button", { name: /Speichern/ })).not.toBeInTheDocument();
  });

  it("ohne Eintragsrecht nicht antippbar", () => {
    render(<MatchRows matches={[row({})]} playerCount={6} canEdit={false} gameDayId="d" myName={null} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("–:–")).toBeInTheDocument();
  });

  it("öffnet sich über das Korrigieren-Ereignis", () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<MatchRows matches={[row({ team1Score: 3, team2Score: 0 })]} playerCount={6} canEdit gameDayId="d" myName={null} />);
    act(() => requestOpenMatch("r1"));
    expect(screen.getByRole("button", { name: /Match 1.*korrigieren/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("Zusatz-Match kann ein Admin entfernen", async () => {
    const fetch = stubFetch(new Response(null, { status: 204 }));
    render(<MatchRows matches={[row({ id: "x16", matchNumber: 16, removable: true })]} playerCount={6} canEdit gameDayId="d" myName={null} />);
    await userEvent.click(screen.getByRole("button", { name: /Match 16.*eintragen/ }));
    await userEvent.click(screen.getByRole("button", { name: "Zusatz-Match entfernen" }));
    fireEvent.click(screen.getByRole("button", { name: "Wirklich entfernen" }));
    expect(fetch).toHaveBeenCalledWith("/api/game-days/d/matches/x16", { method: "DELETE" });
  });
});

describe("germanInvalidReason", () => {
  it("translates the tie rejection", () => {
    expect(germanInvalidReason("Ties are not allowed")).toBe("Unentschieden ist nicht erlaubt.");
  });

  it("translates the sum-to-3 rejection", () => {
    expect(
      germanInvalidReason("Total points must sum to 3 (e.g. 3:0, 2:1, 1:2, 0:3)"),
    ).toBe("Summe muss 3 ergeben (z. B. 3:0, 2:1, 1:2, 0:3).");
  });

  it("translates the non-negative-integer rejection", () => {
    expect(germanInvalidReason("Scores must be non-negative integers")).toBe(
      "Nur ganze Zahlen ≥ 0 erlaubt.",
    );
  });

  it("translates the tennis-set 'winner must reach 6' rejection", () => {
    expect(germanInvalidReason("Winner must reach at least 6")).toBe(
      "Der Sieger muss mindestens 6 erreichen.",
    );
  });

  it("falls back to the generic copy on an unknown reason", () => {
    expect(germanInvalidReason("future server error wording")).toBe("Ungültiges Ergebnis.");
  });
});
