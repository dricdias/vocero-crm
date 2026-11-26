import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { listarAgentesArea, transferirConversa } from "@/server/ai/agentes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type Opcao = { id: string | null; nome: string; principal: boolean };

/**
 * Agentes por área — quem atende esta conversa e para quem a equipe pode
 * passá-la. `id` null = o agente principal.
 */
async function estado(organizationId: string, conversationId: string) {
  const db = getDb();
  const [conv] = await db
    .select({ agenteAreaId: schema.conversation.agenteAreaId })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  if (!conv) return null;
  const [principal] = await db
    .select({ name: schema.agentProfile.name })
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  const areas = await listarAgentesArea(organizationId);
  const principalNome = principal?.name ?? "Agente principal";
  const opcoes: Opcao[] = [
    { id: null, nome: principalNome, principal: true },
    ...areas
      .filter((a) => a.ativo)
      .map((a) => ({ id: a.id, nome: a.nome, principal: false })),
  ];
  const atual = areas.find((a) => a.id === conv.agenteAreaId && a.ativo);
  return {
    atual: atual
      ? { id: atual.id as string | null, nome: atual.nome }
      : { id: null as string | null, nome: principalNome },
    opcoes,
  };
}

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const e = await estado(session.organizationId, id);
  if (!e) return apiError(404, "not_found", "Conversa não encontrada");
  return Response.json(e);
});

const putSchema = z.object({ agenteId: z.string().min(1).nullable() });

/** A equipe troca o agente da conversa: fica registrado no hilo. */
export const PUT = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  const e = await estado(session.organizationId, id);
  if (!e) return apiError(404, "not_found", "Conversa não encontrada");
  const para = e.opcoes.find((o) => o.id === body.data.agenteId);
  if (!para) return apiError(404, "not_found", "Agente não encontrado ou desligado");
  if (para.id === e.atual.id) return Response.json(e);
  await transferirConversa({
    organizationId: session.organizationId,
    conversationId: id,
    para: { id: para.id, nome: para.nome },
    deNome: e.atual.nome,
    origem: "equipe",
  });
  return Response.json(await estado(session.organizationId, id));
});
