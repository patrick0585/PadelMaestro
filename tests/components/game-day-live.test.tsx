import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoreEditor, type EditableMatch } from "@/app/game-day/score-editor";
import type { ScoringRule } from "@/lib/scoring/rule";

const SUM3: ScoringRule = { mode: "fixed", games: 3 };
const SET67: ScoringRule = { mode: "set", target: 6, max: 7 };
import { CurrentMatch, type NextUp } from "@/app/game-day/current-match";
import { AUTO_SAVE_MS, CourtBoard } from "@/app/game-day/court-board";
import { MatchRows, requestOpenMatch, type RowMatch } from "@/app/game-day/match-rows";
import { hapticError, hapticSuccess, hapticTap } from "@/lib/haptics";

vi.mock("@/lib/haptics", () => ({ hapticTap: vi.fn(), hapticSuccess: vi.fn(), hapticError: vi.fn() }));

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
  vi.mocked(hapticTap).mockClear();
  vi.mocked(hapticSuccess).mockClear();
  vi.mocked(hapticError).mockClear();
});

async function score(a: number, b: number) {
  for (let i = 0; i < a; i++) await userEvent.click(screen.getByRole("button", { name: "Punkt für Ben & Anna hinzufügen" }));
  for (let i = 0; i < b; i++) await userEvent.click(screen.getByRole("button", { name: "Punkt für Patrick & Eva hinzufügen" }));
}

describe("ScoreEditor", () => {
  it("Speichern erst bei gültigem Ergebnis, schickt Stand und Version", async () => {
    const fetch = stubFetch(Response.json({}));
    render(<ScoreEditor match={match} rule={SUM3} />);
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
    render(<ScoreEditor match={match} rule={SUM3} />);
    await score(2, 1);
    expect(screen.getByRole("button", { name: "Punkt für Ben & Anna hinzufügen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Punkt für Patrick & Eva hinzufügen" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Punkt für Ben & Anna entfernen" }));
    expect(screen.getByRole("button", { name: "Punkt für Patrick & Eva hinzufügen" })).toBeEnabled();
  });

  it("4 Spieler: 7:6 ist gültig, 5:3 nicht; Obergrenze greift", async () => {
    stubFetch(Response.json({}));
    render(<ScoreEditor match={match} rule={SET67} />);
    await score(5, 3);
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
    await score(2, 3);
    expect(screen.getByRole("button", { name: "Speichern · 7:6" })).toBeEnabled();
  });

  it("übernimmt fremde Änderungen, solange nichts angetippt wurde", async () => {
    const fetch = stubFetch(Response.json({}));
    const scored = { ...match, team1Score: 2, team2Score: 1, version: 1 };
    const { rerender } = render(<ScoreEditor match={scored} rule={SUM3} />);
    rerender(<ScoreEditor match={{ ...scored, team1Score: 3, team2Score: 0, version: 2 }} rule={SUM3} />);
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 3:0" }));
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).expectedVersion).toBe(2);
  });

  it("nach eigenem Antippen bleibt die alte Version, damit der Server den Konflikt meldet", async () => {
    const fetch = stubFetch(Response.json({}, { status: 409 }));
    const scored = { ...match, team1Score: 2, team2Score: 1, version: 1 };
    const { rerender } = render(<ScoreEditor match={scored} rule={SUM3} />);
    await userEvent.click(screen.getByRole("button", { name: "Punkt für Ben & Anna entfernen" }));
    await userEvent.click(screen.getByRole("button", { name: "Punkt für Ben & Anna entfernen" }));
    await userEvent.click(screen.getByRole("button", { name: "Punkt für Patrick & Eva hinzufügen" }));
    await userEvent.click(screen.getByRole("button", { name: "Punkt für Patrick & Eva hinzufügen" }));
    rerender(<ScoreEditor match={{ ...scored, team1Score: 3, team2Score: 0, version: 2 }} rule={SUM3} />);
    expect(screen.getByRole("button", { name: "Speichern · 0:3" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 0:3" }));
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).expectedVersion).toBe(1);
    expect(await screen.findByRole("alert")).toHaveTextContent("Zwischenzeitlich geändert");
  });

  it("nach erfolgreichem Speichern kein zweites Absenden", async () => {
    const fetch = stubFetch(Response.json({}));
    render(<ScoreEditor match={match} rule={SUM3} />);
    await score(2, 1);
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 2:1" }));
    const btn = screen.getByRole("button", { name: /Speichern|…/ });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("ungültiger Stand: Hinweis sagt warum", async () => {
    render(<ScoreEditor match={match} rule={SUM3} />);
    await score(1, 1);
    expect(screen.getByText("Summe muss 3 sein (jetzt 2)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speichern" })).toHaveAccessibleDescription("Summe muss 3 sein (jetzt 2)");
  });

  it("zeigt die Begründung des Servers bei ungültigem Ergebnis", async () => {
    stubFetch(Response.json({ error: "Höchstens 7 Spiele" }, { status: 400 }));
    render(<ScoreEditor match={match} rule={SUM3} />);
    await score(2, 1);
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 2:1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Höchstens 7 Spiele.");
  });

  it("Satz bis 6, höchstens 7: Plus sperrt bei 7, Hinweis nennt die Regel", async () => {
    render(<ScoreEditor match={match} rule={SET67} />);
    expect(screen.getByText("Satz bis 6, höchstens 7 – z. B. 6:4 oder 7:6")).toBeInTheDocument();
    await score(7, 0);
    expect(screen.getByRole("button", { name: "Punkt für Ben & Anna hinzufügen" })).toBeDisabled();
    expect(screen.getByText("7 Spiele nur nach 6:5 oder 6:6")).toBeInTheDocument();
  });

  it("zeigt Konflikt-Fehler", async () => {
    stubFetch(Response.json({}, { status: 409 }));
    render(<ScoreEditor match={match} rule={SUM3} />);
    await score(3, 0);
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 3:0" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Zwischenzeitlich geändert");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("CurrentMatch", () => {
  const segments = ["done", "done", "done", "current", "open"] as const;
  const next: NextUp = { matchNumber: 5, team1: ["Ben", "Eva"], team2: ["Anna", "Patrick"], you: "plays" };

  it("Fortschritt, Tafel und die nächste Paarung", () => {
    render(<CurrentMatch current={match} segments={[...segments]} rule={SUM3} canEdit myName="Patrick" next={next} />);
    expect(screen.getByText("Match 4 von 5")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Ergebnis Match 4" })).toBeInTheDocument();
    expect(screen.getByText("Du spielst als Nächstes")).toBeInTheDocument();
    expect(screen.getByText(/Ben & Eva/)).toBeInTheDocument();
  });

  it("zeigt Pause, wenn man heute spielt, aber nicht im nächsten Match", () => {
    render(<CurrentMatch current={match} segments={[...segments]} rule={SUM3} canEdit myName="Patrick" next={{ ...next, you: "pauses" }} />);
    expect(screen.getByText(/Als Nächstes · Match 5 · du pausierst/)).toBeInTheDocument();
  });

  it("ohne Eintragsrecht nur die Tafel als Anzeige", () => {
    render(<CurrentMatch current={match} segments={[...segments]} rule={SUM3} canEdit={false} myName={null} next={null} />);
    expect(screen.queryByRole("button", { name: /Punkt für/ })).not.toBeInTheDocument();
    expect(screen.getByText("Ergebnis tragen die Spieler ein")).toBeInTheDocument();
  });

  it("nach dem Speichern: Hinweis mit Korrigieren, der das Match in der Liste öffnet", async () => {
    stubFetch(Response.json({}));
    Element.prototype.scrollIntoView = vi.fn();
    const scoredRow: RowMatch = { ...match, team1Score: 1, team2Score: 2, version: 1, scoredByName: null, scoredAt: null, removable: false };
    const { rerender } = render(
      <>
        <CurrentMatch current={match} segments={[...segments]} rule={SUM3} canEdit myName={null} next={null} />
        <MatchRows matches={[]} rule={SUM3} canEdit gameDayId="d" myName={null} />
      </>,
    );
    await score(1, 2);
    await userEvent.click(screen.getByTestId("court-save"));
    const toast = await screen.findByText(/Match 4: 1:2/);
    expect(toast.closest("[role=status]")).toHaveTextContent("für Patrick & Eva");
    await userEvent.click(screen.getByRole("button", { name: "Korrigieren" }));
    // Das Match taucht erst nach dem Neuladen in „Gewertet“ auf.
    rerender(
      <>
        <CurrentMatch current={null} segments={[...segments]} rule={SUM3} canEdit myName={null} next={null} />
        <MatchRows matches={[scoredRow]} rule={SUM3} canEdit gameDayId="d" myName={null} />
      </>,
    );
    expect(screen.getByRole("button", { name: /Match 4.*korrigieren/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("alle gewertet", () => {
    render(<CurrentMatch current={null} segments={["done", "done"]} rule={SUM3} canEdit myName={null} next={null} />);
    expect(screen.getByText("Alle 2 Matches gewertet")).toBeInTheDocument();
  });
});

describe("CourtBoard", () => {
  const plus = (team: string) => screen.getByRole("button", { name: `Punkt für ${team} hinzufügen` });

  it("zeigt beim Zählen die Regel statt einer Warnung", () => {
    render(<CourtBoard match={match} rule={SET67} myName={null} />);
    fireEvent.click(plus("Ben & Anna"));
    expect(screen.getByText(/Satz bis 6/)).not.toHaveClass("text-amber-300");
  });

  it("markiert das eigene Team", () => {
    render(<CourtBoard match={match} rule={SUM3} myName="Patrick" />);
    expect(screen.getByText("DU")).toBeInTheDocument();
  });

  it("speichert eine erreichte Summe nach dem Countdown von selbst", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetch(Response.json({}));
    render(<CourtBoard match={match} rule={SUM3} myName={null} />);
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(plus("Patrick & Eva"));
    expect(screen.getByTestId("court-save")).toHaveTextContent("Speichert 2:1");
    // Während des Countdowns ist die Tafel gesperrt.
    expect(plus("Ben & Anna")).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(AUTO_SAVE_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ team1Score: 2, team2Score: 1 });
  });

  it("Stopp hält das automatische Speichern", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetch(Response.json({}));
    render(<CourtBoard match={match} rule={SUM3} myName={null} />);
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(screen.getByRole("button", { name: "Stopp" }));
    await act(async () => {
      vi.advanceTimersByTime(AUTO_SAVE_MS * 2);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("court-save")).toHaveTextContent("Speichern · 3:0");
    expect(screen.getByRole("button", { name: "Punkt für Ben & Anna entfernen" })).toBeEnabled();
  });

  it("Haptik: Tipp bei +1 und −, Erfolg nach dem Speichern", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubFetch(Response.json({}));
    render(<CourtBoard match={match} rule={SUM3} myName={null} />);
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(screen.getByRole("button", { name: "Punkt für Ben & Anna entfernen" }));
    expect(hapticTap).toHaveBeenCalledTimes(2);
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(plus("Patrick & Eva"));
    expect(hapticSuccess).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(AUTO_SAVE_MS);
    });
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(hapticError).not.toHaveBeenCalled();
  });

  it("Haptik: Fehler, wenn das Speichern scheitert", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubFetch(Response.json({}, { status: 500 }));
    render(<CourtBoard match={match} rule={SET67} myName={null} />);
    for (let i = 0; i < 6; i++) fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(screen.getByTestId("court-save"));
    await act(async () => {});
    expect(hapticError).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).not.toHaveBeenCalled();
  });

  it("speichert bei Satz-Regeln nur auf Tipp", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetch(Response.json({}));
    render(<CourtBoard match={match} rule={SET67} myName={null} />);
    for (let i = 0; i < 6; i++) fireEvent.click(plus("Ben & Anna"));
    for (let i = 0; i < 4; i++) fireEvent.click(plus("Patrick & Eva"));
    await act(async () => {
      vi.advanceTimersByTime(AUTO_SAVE_MS * 2);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("court-save"));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [409, "Zwischenzeitlich geändert"],
    [500, "HTTP 500"],
  ])("fehlgeschlagenes Auto-Speichern (%i) zeigt den Fehler und versucht nicht erneut", async (status, text) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Antwort kommt erst nach einem echten Netz-Tick, damit React den busy-Zustand rendert.
    const fetchMock = vi.fn(() => new Promise<Response>((r) => setTimeout(() => r(Response.json({}, { status })), 100)));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourtBoard match={match} rule={SUM3} myName={null} />);
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(plus("Patrick & Eva"));
    // In kleinen Schritten, damit React zwischen Senden und Antwort rendert (wie im Browser).
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
    }
    expect(screen.getByRole("alert")).toHaveTextContent(text);
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Tipp auf „Speichert x:y“ während des Countdowns speichert genau einmal", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetch(Response.json({}));
    render(<CourtBoard match={match} rule={SUM3} myName={null} />);
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(plus("Patrick & Eva"));
    fireEvent.click(screen.getByRole("button", { name: /Speichert 2:1/ }));
    await act(async () => {
      vi.advanceTimersByTime(AUTO_SAVE_MS * 3);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("nach Stopp ist Minus wieder frei, eine Änderung startet den Countdown neu", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetch(Response.json({}));
    render(<CourtBoard match={match} rule={SUM3} myName={null} />);
    for (let i = 0; i < 3; i++) fireEvent.click(plus("Ben & Anna"));
    fireEvent.click(screen.getByRole("button", { name: "Stopp" }));
    fireEvent.click(screen.getByRole("button", { name: "Punkt für Ben & Anna entfernen" }));
    fireEvent.click(plus("Patrick & Eva"));
    expect(screen.getByTestId("court-save")).toHaveTextContent("Speichert 2:1");
    await act(async () => {
      vi.advanceTimersByTime(AUTO_SAVE_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ team1Score: 2, team2Score: 1 });
  });

  it("readOnly: keine Buttons, kein Auto-Speichern", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetch(Response.json({}));
    render(<CourtBoard match={{ ...match, team1Score: 2, team2Score: 1, version: 1 }} rule={SUM3} myName={null} readOnly />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(AUTO_SAVE_MS * 2);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ScoreEditor (Zeile) nach dem Hook-Umbau", () => {
  it("meldet den gespeicherten Stand über onSaved und ruft refresh auf", async () => {
    stubFetch(Response.json({}));
    const onSaved = vi.fn();
    render(<ScoreEditor match={match} rule={SUM3} onSaved={onSaved} onCancel={() => {}} />);
    await score(1, 2);
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 1:2" }));
    expect(onSaved).toHaveBeenCalledWith([1, 2]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("Netzwerkfehler zeigt Hinweis und erlaubt erneutes Speichern", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fn);
    render(<ScoreEditor match={match} rule={SUM3} />);
    await score(3, 0);
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 3:0" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Keine Verbindung");
    await userEvent.click(screen.getByRole("button", { name: "Speichern · 3:0" }));
    expect(fn).toHaveBeenCalledTimes(2);
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
    render(<MatchRows matches={[row({ team1Score: 2, team2Score: 1 })]} rule={SUM3} canEdit gameDayId="d" myName="Patrick" />);
    expect(screen.getByText("Patrick").className).toContain("text-primary");
    await userEvent.click(screen.getByRole("button", { name: "Match 1, Ben & Anna gegen Patrick & Eva, 2:1, korrigieren" }));
    expect(screen.getByRole("button", { name: "Speichern · 2:1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("button", { name: /Speichern/ })).not.toBeInTheDocument();
  });

  it("ohne Eintragsrecht nicht antippbar", () => {
    render(<MatchRows matches={[row({})]} rule={SUM3} canEdit={false} gameDayId="d" myName={null} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("–:–")).toBeInTheDocument();
  });

  it("öffnet sich über das Korrigieren-Ereignis", () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<MatchRows matches={[row({ team1Score: 3, team2Score: 0 })]} rule={SUM3} canEdit gameDayId="d" myName={null} />);
    act(() => requestOpenMatch("r1"));
    expect(screen.getByRole("button", { name: /Match 1.*korrigieren/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("Zusatz-Match kann ein Admin entfernen", async () => {
    const fetch = stubFetch(new Response(null, { status: 204 }));
    render(<MatchRows matches={[row({ id: "x16", matchNumber: 16, removable: true })]} rule={SUM3} canEdit gameDayId="d" myName={null} />);
    await userEvent.click(screen.getByRole("button", { name: /Match 16.*eintragen/ }));
    await userEvent.click(screen.getByRole("button", { name: "Zusatz-Match entfernen" }));
    fireEvent.click(screen.getByRole("button", { name: "Wirklich entfernen" }));
    expect(fetch).toHaveBeenCalledWith("/api/game-days/d/matches/x16", { method: "DELETE" });
  });
});
