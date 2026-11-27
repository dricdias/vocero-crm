import { createHash } from "node:crypto";
import { eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { evolutionEnabled } from "./flag";

/**
 * Credenciais do Evolution Go. Cada linha é um número (uma instância):
 * o principal da org (`agente_area_id` NULL) e, opcionalmente, um número
 * próprio por agente de área.
 */

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

const ec = schema.evolutionCredentials;
const doNumero = (agenteAreaId: string | null) =>
  agenteAreaId ? eq(ec.agenteAreaId, agenteAreaId) : isNull(ec.agenteAreaId);

/** O número principal da org. */
export async function getEvolutionByOrg(
  organizationId: string,
  db?: ReturnType<typeof getDb>,
): Promise<EvolutionCredentials | null> {
  if (!evolutionEnabled()) return null;
  const [row] = await (db ?? getDb())
    .select()
    .from(ec)
    .where(scoped(ec.organizationId, organizationId, isNull(ec.agenteAreaId)))
    .limit(1);
  return row ? decode(row) : null;
}

/** O número próprio de um agente de área, se tiver. */
export async function getEvolutionDoAgente(
  organizationId: string,
  agenteAreaId: string,
): Promise<EvolutionCredentials | null> {
  if (!evolutionEnabled()) return null;
  const [row] = await getDb()
    .select()
    .from(ec)
    .where(scoped(ec.organizationId, organizationId, eq(ec.agenteAreaId, agenteAreaId)))
    .limit(1);
  return row ? decode(row) : null;
}

/**
 * O número por onde uma conversa fala: o último em que o cliente escreveu.
 * Sem linha (ou se ela foi desvinculada), o principal.
 */
export async function getEvolutionDaLinha(
  organizationId: string,
  linhaId: string | null | undefined,
): Promise<EvolutionCredentials | null> {
  if (!evolutionEnabled()) return null;
  if (linhaId) {
    const [row] = await getDb()
      .select()
      .from(ec)
      .where(scoped(ec.organizationId, organizationId, eq(ec.id, linhaId)))
      .limit(1);
    if (row) return decode(row);
  }
  return getEvolutionByOrg(organizationId);
}

/** Estado dos números dos agentes, sem decifrar tokens (para a lista). */
export async function numerosDosAgentes(
  organizationId: string,
): Promise<Map<string, "connected" | "reconnect_required">> {
  if (!evolutionEnabled()) return new Map();
  const rows = await getDb()
    .select({ agenteAreaId: ec.agenteAreaId, status: ec.status })
    .from(ec)
    .where(scoped(ec.organizationId, organizationId, isNotNull(ec.agenteAreaId)));
  return new Map(rows.map((r) => [r.agenteAreaId!, r.status]));
}

/** Outro número da org já usa este token de instância? */
export async function tokenEmUso(
  organizationId: string,
  token: string,
  agenteAreaId: string | null,
): Promise<boolean> {
  const rows = await getDb()
    .select()
    .from(ec)
    .where(scoped(ec.organizationId, organizationId));
  return rows.some(
    (r) => (r.agenteAreaId ?? null) !== agenteAreaId && decode(r).token === token,
  );
}

export async function getEvolutionByWebhook(
  token: string,
): Promise<EvolutionCredentials | null> {
  if (!evolutionEnabled() || !/^[a-f0-9]{64}$/.test(token)) return null;
  // Resolución inicial del tenant por secreto de webhook; el resto usa scoped().
  const [row] = await getDb()
    .select()
    .from(ec)
    .where(eq(ec.webhookHash, webhookHash(token)))
    .limit(1);
  return row ? decode(row) : null;
}
export async function saveEvolution(input: {
  organizationId: string;
  baseUrl: string;
  token: string;
  webhookToken: string;
  connected: boolean;
  /** Número próprio deste agente; sem ele, o principal. */
  agenteAreaId?: string | null;
}) {
  const agenteAreaId = input.agenteAreaId ?? null;
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
  const db = getDb();
  // O índice do principal é parcial: o upsert é feito à mão.
  const updated = await db
    .update(ec)
    .set(values)
    .where(scoped(ec.organizationId, input.organizationId, doNumero(agenteAreaId)))
    .returning({ id: ec.id });
  if (updated[0]) return;
  await db.insert(ec).values({
    id: `evo_${crypto.randomUUID()}`,
    organizationId: input.organizationId,
    agenteAreaId,
    ...values,
  });
}
/**
 * Estado da conexão. Com `linhaId`, daquele número; sem ele, do principal
 * (ou do número do agente, com `agenteAreaId`).
 */
export async function setEvolutionStatus(
  organizationId: string,
  connected: boolean,
  qual: { linhaId?: string; agenteAreaId?: string | null } = {},
) {
  await getDb()
    .update(ec)
    .set({
      status: connected ? "connected" : "reconnect_required",
      updatedAt: new Date(),
    })
    .where(
      scoped(
        ec.organizationId,
        organizationId,
        qual.linhaId ? eq(ec.id, qual.linhaId) : doNumero(qual.agenteAreaId ?? null),
      ),
    );
}
export async function deleteEvolution(organizationId: string, agenteAreaId: string | null = null) {
  await getDb()
    .delete(ec)
    .where(scoped(ec.organizationId, organizationId, doNumero(agenteAreaId)));
}
