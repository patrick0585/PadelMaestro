import { loadTemplate } from "./load";
import { seededShuffle } from "./shuffle";

export interface PlayerRef {
  id: string;
  name: string;
}

export interface MatchPlan {
  matchNumber: number;
  team1: [PlayerRef, PlayerRef];
  team2: [PlayerRef, PlayerRef];
  sitting: PlayerRef[];
}

export function assignPlayersToTemplate(players: PlayerRef[], seed: string): MatchPlan[] {
  const template = loadTemplate(players.length);
  const ordered = seededShuffle(players, seed);

  return template.matches.map<MatchPlan>((m) => ({
    matchNumber: m.matchNumber,
    team1: [ordered[m.team1[0] - 1], ordered[m.team1[1] - 1]],
    team2: [ordered[m.team2[0] - 1], ordered[m.team2[1] - 1]],
    sitting: m.sitting.map((i) => ordered[i - 1]),
  }));
}
