import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { evolutionEnabled } from "@/server/evolution/flag";
import { evolutionSettingsDoNumero } from "@/server/evolution/settings";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Número próprio de um agente de área (Evolution Go): o mesmo fluxo do
 * número principal — salvar a instância, gerar o QR, consultar, desvincular.
 */
const handler = withAuth(async (session, req: Request, ctx: Params) => {
  if (!evolutionEnabled()) return new Response(null, { status: 404 });
  const { id } = await ctx.params;
  const [agente] = await getDb()
    .select({ id: schema.agenteArea.id })
    .from(schema.agenteArea)
    .where(scoped(schema.agenteArea.organizationId, session.organizationId, eq(schema.agenteArea.id, id)))
    .limit(1);
  if (!agente) return apiError(404, "not_found", "Agente não encontrado");
  return evolutionSettingsDoNumero(session, req, agente.id);
});

export const GET = handler;
export const PUT = handler;
export const POST = handler;
export const DELETE = handler;
