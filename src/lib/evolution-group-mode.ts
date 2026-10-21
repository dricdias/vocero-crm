import { z } from "zod";

export const evolutionGroupModeSchema = z.enum(["mentions", "all"]);
export type EvolutionGroupMode = z.infer<typeof evolutionGroupModeSchema>;
export const evolutionGroupJidSchema = z.string().max(96).regex(/^\d+(?:-\d+)?@g\.us$/);
