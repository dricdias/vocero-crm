import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";

/**
 * Agentes por área (Vendas, Financeiro…) num número só.
 *
 * O principal é o `agent_profile` de sempre: recebe as conversas novas e
 * guarda o interruptor geral, a saudação e a volta automática. Uma conversa
 * com `agente_area_id` é atendida pelo agente daquela área, com o nome, o tom,
 * as instruções e as regras dele, e a mesma base de conhecimento.
 *
 * Qualquer agente pode transferir para outro quando o assunto não é o dele: o
 * cliente segue na mesma conversa e no mesmo número, e o novo agente responde
 * no mesmo turno.
 */

export type AgenteArea = typeof schema.agenteArea.$inferSelect;
type AgentProfile = typeof schema.agentProfile.$inferSelect;

/** O assunto do principal, para os agentes de área saberem quando devolver. */
export const ASSUNTO_PRINCIPAL =
  "atendimento geral e tudo o que não é de nenhuma outra área";

/** Um agente que pode receber a conversa: `id` null = o principal. */
export type DestinoAgente = { id: string | null; nome: string; assunto: string };

/**
 * O perfil que o turno usa: o principal com o que a área muda por cima.
 * Saudação, interruptor e volta automática continuam sendo do principal.
 */
export function perfilDoTurno(profile: AgentProfile, area: AgenteArea | null): AgentProfile {
  if (!area) return profile;
  return {
    ...profile,
    name: area.nome,
    tone: area.tom ?? profile.tone,
    // As instruções gerais do negócio valem para todos; as da área vêm depois
    // e, por estarem por último, prevalecem quando as duas falam do mesmo.
    instructions:
      [
        profile.instructions,
        area.instrucoes ? `Instruções específicas de ${area.nome}:\n${area.instrucoes}` : null,
      ]
        .filter(Boolean)
        .join("\n\n") || null,
    escalationRules: area.regrasEscalonamento ?? profile.escalationRules,
  };
}

/** Para quem o agente atual pode transferir: todos os outros, ativos. */
export function outrosAgentes(
  atualId: string | null,
  principalNome: string,
  areas: readonly AgenteArea[]
): DestinoAgente[] {
  const lista: DestinoAgente[] = [];
  if (atualId !== null) {
    lista.push({ id: null, nome: principalNome, assunto: ASSUNTO_PRINCIPAL });
  }
  for (const a of areas) {
    if (!a.ativo || a.id === atualId) continue;
    lista.push({ id: a.id, nome: a.nome, assunto: a.assunto });
  }
  return lista;
}

/**
 * O nome que o modelo devolveu, contra os destinos reais (exato e depois sem
 * maiúsculas nem acentos). Sem correspondência: null, e o turno escala para
 * uma pessoa em vez de transferir às cegas.
 */
export function resolverDestino(
  pedido: string,
  destinos: readonly DestinoAgente[]
): DestinoAgente | null {
  const limpo = pedido.trim();
  const exato = destinos.find((d) => d.nome === limpo);
  if (exato) return exato;
  const chave = normalizar(limpo);
  return destinos.find((d) => normalizar(d.nome) === chave) ?? null;
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export async function listarAgentesArea(organizationId: string): Promise<AgenteArea[]> {
  return getDb()
    .select()
    .from(schema.agenteArea)
    .where(scoped(schema.agenteArea.organizationId, organizationId))
    .orderBy(asc(schema.agenteArea.createdAt));
}

/**
 * Passa a conversa para outro agente e deixa o registro no hilo. Serve para a
 * IA e para a equipe (o seletor do painel do contato).
 */
export async function transferirConversa(input: {
  organizationId: string;
  conversationId: string;
  para: { id: string | null; nome: string };
  deNome: string;
  origem: "ia" | "equipe";
  motivo?: string | null;
}): Promise<boolean> {
  const db = getDb();
  const updated = await db
    .update(schema.conversation)
    .set({ agenteAreaId: input.para.id, updatedAt: new Date() })
    .where(
      scoped(
        schema.conversation.organizationId,
        input.organizationId,
        eq(schema.conversation.id, input.conversationId)
      )
    )
    .returning({ id: schema.conversation.id });
  if (!updated[0]) return false;
  await db.insert(schema.agenteTransferencia).values({
    id: newId("agenteTransferencia"),
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    deNome: input.deNome,
    paraNome: input.para.nome,
    origem: input.origem,
    motivo: input.motivo?.trim().slice(0, 300) || null,
  });
  publish(input.organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: input.conversationId } },
  });
  return true;
}

export async function transferenciasDeConversa(
  organizationId: string,
  conversationId: string
) {
  return getDb()
    .select()
    .from(schema.agenteTransferencia)
    .where(
      and(
        eq(schema.agenteTransferencia.organizationId, organizationId),
        eq(schema.agenteTransferencia.conversationId, conversationId)
      )
    )
    .orderBy(asc(schema.agenteTransferencia.occurredAt));
}
