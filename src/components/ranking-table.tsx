import type { RankingRow } from "@/lib/ranking/compute";

export function RankingTable({ ranking }: { ranking: RankingRow[] }) {
  if (ranking.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">Noch keine Spiele in dieser Saison.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="border-b text-left">
        <tr>
          <th className="py-2">#</th>
          <th>Spieler</th>
          <th className="text-right">Spiele</th>
          <th className="text-right">Punkte</th>
          <th className="text-right">ppS</th>
          <th className="text-right">Joker</th>
        </tr>
      </thead>
      <tbody>
        {ranking.map((r) => (
          <tr key={r.playerId} className="border-b last:border-b-0">
            <td className="py-2">{r.rank}</td>
            <td>{r.playerName}</td>
            <td className="text-right">{r.games}</td>
            <td className="text-right">{r.points.toFixed(0)}</td>
            <td className="text-right font-medium">{r.pointsPerGame.toFixed(2)}</td>
            <td className="text-right">{r.jokersUsed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
