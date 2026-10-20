import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { evolutionEnabled } from "./flag";

export function webhookHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
function decode(row: typeof schema.evolutionCredentials.$inferSelect) {
  return {
    ...row,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
  };
}
export type EvolutionCredentials = ReturnType<typeof decode>;
export async function getEvolutionByOrg(
  organizationId: string,
  db?: ReturnType<typeof getDb>,
): Promise<EvolutionCredentials | null> {
  if (!evolutionEnabled()) return null;
  const [row] = await (db ?? getDb())
    .select()
    .from(schema.evolutionCredentials)
    .where(scoped(schema.evolutionCredentials.organizationId, organizationId))
    .limit(1);
  return row ? decode(row) : null;
}
export async function getEvolutionByWebhook(
  token: string,
): Promise<EvolutionCredentials | null> {
  if (!evolutionEnabled() || !/^[a-f0-9]{64}$/.test(token)) return null;
  // Resolución inicial del tenant por secreto de webhook; el resto usa scoped().
  const [row] = await getDb()
    .select()
    .from(schema.evolutionCredentials)
    .where(eq(schema.evolutionCredentials.webhookHash, webhookHash(token)))
    .limit(1);
  return row ? decode(row) : null;
}
export async function saveEvolution(input: {
  organizationId: string;
  baseUrl: string;
  token: string;
  webhookToken: string;
  connected: boolean;
}) {
  const secret = encryptSecret(input.token);
  const values = {
    baseUrl: input.baseUrl,
    tokenCipher: secret.cipher,
    tokenIv: secret.iv,
    tokenTag: secret.tag,
    webhookHash: webhookHash(input.webhookToken),
    status: input.connected
      ? ("connected" as const)
      : ("reconnect_required" as const),
    updatedAt: new Date(),
  };
  await getDb()
    .insert(schema.evolutionCredentials)
    .values({
      id: `evo_${crypto.randomUUID()}`,
      organizationId: input.organizationId,
      ...values,
    })
    .onConflictDoUpdate({
      target: schema.evolutionCredentials.organizationId,
      set: values,
    });
}
export async function setEvolutionStatus(
  organizationId: string,
  connected: boolean,
) {
  await getDb()
    .update(schema.evolutionCredentials)
    .set({
      status: connected ? "connected" : "reconnect_required",
      updatedAt: new Date(),
    })
    .where(scoped(schema.evolutionCredentials.organizationId, organizationId));
}
export async function deleteEvolution(organizationId: string) {
  await getDb()
    .delete(schema.evolutionCredentials)
    .where(scoped(schema.evolutionCredentials.organizationId, organizationId));
}
