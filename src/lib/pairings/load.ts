import fourPlayers from "./templates/4-players.json";
import fivePlayers from "./templates/5-players.json";
import sixPlayers from "./templates/6-players.json";
import { TemplateSchema, type Template } from "./types";

const TEMPLATES: Record<number, unknown> = {
  4: fourPlayers,
  5: fivePlayers,
  6: sixPlayers,
};

export function loadTemplate(playerCount: number): Template {
  const raw = TEMPLATES[playerCount];
  if (!raw) {
    throw new Error(`unsupported player count: ${playerCount} (supported: 4, 5, 6)`);
  }
  return TemplateSchema.parse(raw);
}
