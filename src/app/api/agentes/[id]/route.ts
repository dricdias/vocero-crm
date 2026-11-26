import { eq } from "drizzle-orm";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { agenteAreaDto, agenteAreaPatchSchema, nomeRepetido } from "../schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const alcance = (organizationId: string, id: string) =>
  scoped(schema.agenteArea.organizationId, organizationId, eq(schema.agenteArea.id, id));

export const PUT = withAuth(async (session, req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Só quem administra edita agentes");
  }
  const { id } = await ctx.params;
  const body = await parseBody(req, agenteAreaPatchSchema);
  if (!body.ok) return body.response;
  const d = body.data;
  try {
    const [atualizado] = await getDb()
      .update(schema.agenteArea)
      .set({
        ...(d.nome !== undefined && { nome: d.nome }),
        ...(d.assunto !== undefined && { assunto: d.assunto }),
        ...(d.tom !== undefined && { tom: d.tom || null }),
        ...(d.instrucoes !== undefined && { instrucoes: d.instrucoes || null }),
        ...(d.regrasEscalonamento !== undefined && {
          regrasEscalonamento: d.regrasEscalonamento || null,
        }),
        ...(d.ativo !== undefined && { ativo: d.ativo }),
        updatedAt: new Date(),
      })
      .where(alcance(session.organizationId, id))
      .returning();
    if (!atualizado) return apiError(404, "not_found", "Agente não encontrado");
    return Response.json({ agente: agenteAreaDto(atualizado) });
  } catch (err) {
    if (nomeRepetido(err)) return apiError(409, "duplicate", "Já existe um agente com esse nome");
    throw err;
  }
});

/** Apagar: as conversas dele voltam ao principal (`on delete set null`). */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Só quem administra apaga agentes");
  }
  const { id } = await ctx.params;
  const apagados = await getDb()
    .delete(schema.agenteArea)
    .where(alcance(session.organizationId, id))
    .returning({ id: schema.agenteArea.id });
  if (!apagados[0]) return apiError(404, "not_found", "Agente não encontrado");
  return new Response(null, { status: 204 });
});
