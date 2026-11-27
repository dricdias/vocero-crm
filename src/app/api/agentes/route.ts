import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { listarAgentesArea } from "@/server/ai/agentes";
import { numerosDosAgentes } from "@/server/evolution/credentials";
import { evolutionEnabled } from "@/server/evolution/flag";
import { agenteAreaDto, agenteAreaSchema, nomeRepetido } from "./schema";

export const dynamic = "force-dynamic";

/** Tope de áreas: o prompt de cada agente lista todos os outros. */
const MAX_AREAS = 10;

/** Agentes por área — a lista da tela Agente. */
export const GET = withAuth(async (session) => {
  const [areas, numeros] = await Promise.all([
    listarAgentesArea(session.organizationId),
    numerosDosAgentes(session.organizationId),
  ]);
  return Response.json({
    // Número próprio por agente só existe com o Evolution Go.
    numerosProprios: evolutionEnabled(),
    agentes: areas.map((a) => ({ ...agenteAreaDto(a), numero: numeros.get(a.id) ?? null })),
  });
});

export const POST = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Só quem administra cria agentes");
  }
  const body = await parseBody(req, agenteAreaSchema);
  if (!body.ok) return body.response;
  const atuais = await listarAgentesArea(session.organizationId);
  if (atuais.length >= MAX_AREAS) {
    return apiError(409, "limit", `Você pode ter até ${MAX_AREAS} agentes de área`);
  }
  try {
    const [criado] = await getDb()
      .insert(schema.agenteArea)
      .values({
        id: newId("agenteArea"),
        organizationId: session.organizationId,
        nome: body.data.nome,
        assunto: body.data.assunto,
        tom: body.data.tom || null,
        instrucoes: body.data.instrucoes || null,
        regrasEscalonamento: body.data.regrasEscalonamento || null,
        ativo: body.data.ativo ?? true,
      })
      .returning();
    return Response.json({ agente: agenteAreaDto(criado!) }, { status: 201 });
  } catch (err) {
    if (nomeRepetido(err)) return apiError(409, "duplicate", "Já existe um agente com esse nome");
    throw err;
  }
});
