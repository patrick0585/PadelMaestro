import { z } from "zod";

export const MatchFormatSchema = z.enum(["first-to-3", "first-to-6"]);
export type MatchFormat = z.infer<typeof MatchFormatSchema>;

export const MatchSlotSchema = z.object({
  matchNumber: z.number().int().positive(),
  team1: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  team2: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  sitting: z.array(z.number().int().positive()),
});
export type MatchSlot = z.infer<typeof MatchSlotSchema>;

export const TemplateSchema = z
  .object({
    playerCount: z.number().int().min(4).max(6),
    format: MatchFormatSchema,
    totalMatches: z.number().int().positive(),
    matches: z.array(MatchSlotSchema).min(1),
  })
  .refine((t) => t.matches.length === t.totalMatches, {
    message: "matches.length must equal totalMatches",
  });
export type Template = z.infer<typeof TemplateSchema>;
