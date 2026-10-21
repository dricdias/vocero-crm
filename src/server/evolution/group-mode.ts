import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { evolutionGroupJidSchema, evolutionGroupModeSchema, type EvolutionGroupMode } from "@/lib/evolution-group-mode";

export async function getEvolutionGroupMode(organizationId: string, groupJid: string): Promise<EvolutionGroupMode> {
  if (!evolutionGroupJidSchema.safeParse(groupJid).success) return "mentions";
  const [row] = await getDb().select({ mode: schema.evolutionGroupSettings.replyMode })
    .from(schema.evolutionGroupSettings)
    .where(scoped(schema.evolutionGroupSettings.organizationId, organizationId, eq(schema.evolutionGroupSettings.groupJid, groupJid)))
    .limit(1);
  return evolutionGroupModeSchema.catch("mentions").parse(row?.mode);
}

export async function setEvolutionGroupMode(organizationId: string, groupJid: string, mode: EvolutionGroupMode) {
  const values = { groupJid: evolutionGroupJidSchema.parse(groupJid), replyMode: evolutionGroupModeSchema.parse(mode), updatedAt: new Date() };
  await getDb().insert(schema.evolutionGroupSettings)
    .values({ id: `evg_${crypto.randomUUID()}`, organizationId, ...values })
    .onConflictDoUpdate({ target: [schema.evolutionGroupSettings.organizationId, schema.evolutionGroupSettings.groupJid], set: values });
}
