import { PrintButton } from "./print-button";

export interface PrintMatch {
  id: string;
  matchNumber: number;
  team1A: string;
  team1B: string;
  team2A: string;
  team2B: string;
}

export interface PrintSheetProps {
  dateText: string;
  status: string;
  maxScore: number;
  playing: string[];
  joker: string[];
  matches: PrintMatch[];
}

export function PrintSheet({
  dateText,
  status,
  maxScore,
  playing,
  joker,
  matches,
}: PrintSheetProps) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-black print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href="/game-day" className="text-sm text-foreground-muted underline">
          ← Zurück zum Spieltag
        </a>
        <PrintButton />
      </div>

      <header className="mb-5 border-b-2 border-black pb-3">
        <div className="text-xs font-semibold uppercase tracking-wider">
          Spieltag
        </div>
        <h1 className="mt-0.5 text-2xl font-bold">{dateText}</h1>
        <div className="mt-1 text-xs">
          {playing.length} Spieler · {matches.length} Matches · max {maxScore} Punkte
        </div>
      </header>

      <section className="mb-5">
        <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wider">
          Dabei ({playing.length})
        </h2>
        <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-sm">
          {playing.map((name) => (
            <div key={name}>{name}</div>
          ))}
        </div>
        {joker.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider">
              Joker ({joker.length})
            </h3>
            <div className="text-sm">{joker.join(", ")}</div>
          </div>
        )}
      </section>

      {matches.length === 0 ? (
        <p className="text-sm italic">
          Matches sind noch nicht erstellt (Status: {status}).
        </p>
      ) : (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wider">
            Matches
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="w-8 py-1 pr-2">#</th>
                <th className="py-1 pr-2">Team 1</th>
                <th className="w-16 py-1 text-center">Score</th>
                <th className="py-1 px-2">Team 2</th>
                <th className="w-16 py-1 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id} className="border-b border-gray-400 align-top">
                  <td className="py-3 pr-2 font-bold tabular-nums">
                    {m.matchNumber}
                  </td>
                  <td className="py-3 pr-2">
                    <div>{m.team1A}</div>
                    <div>{m.team1B}</div>
                  </td>
                  <td className="py-3">
                    <div
                      data-testid={`score-box-team1-${m.matchNumber}`}
                      className="mx-auto h-8 w-12 border-b-2 border-black"
                    />
                  </td>
                  <td className="py-3 px-2">
                    <div>{m.team2A}</div>
                    <div>{m.team2B}</div>
                  </td>
                  <td className="py-3">
                    <div
                      data-testid={`score-box-team2-${m.matchNumber}`}
                      className="mx-auto h-8 w-12 border-b-2 border-black"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="mt-6 text-[0.7rem] text-gray-700">
        Punkte pro Match (max {maxScore}): Sieger bekommt seine erspielten
        Punkte, Verlierer den Rest. Joker zählt 10 × Saisonschnitt.
      </footer>
    </div>
  );
}
