import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import type { SessionContext } from "@/lib/auth/session";
import { evolutionGroupModeSchema } from "@/lib/evolution-group-mode";
import { getConversation } from "@/server/inbox/queries";
import { publish } from "@/server/events/bus";
import { evolutionEnabled } from "./flag";
import { evolutionGroupTarget, groupBotJid } from "./groups";
import { getEvolutionByOrg } from "./credentials";
import { getEvolutionGroupMode, setEvolutionGroupMode } from "./group-mode";

const bodySchema = z.object({ mode: evolutionGroupModeSchema }).strict();
export async function evolutionGroupModeSettings(session: SessionContext, req: Request, conversationId: string): Promise<Response> {
  if (!evolutionEnabled()) return new Response(null, { status: 404 });
  if (req.method === "PATCH" && !canConfigure(session.role)) return apiError(403, "forbidden", "Somente o administrador pode alterar o modo do grupo");
  const row = await getConversation(session.organizationId, conversationId);
  const group = row && row.conversation.organizationId === session.organizationId && row.contact.organizationId === session.organizationId && !row.conversation.isTest && row.conversation.channel === "whatsapp" ? evolutionGroupTarget(row.contact.waIdentity) : null;
  if (!group || !(await getEvolutionByOrg(session.organizationId))) return apiError(404, "not_found", "Grupo Evolution Go não encontrado");
  const available = !!groupBotJid();
  if (req.method === "GET") return Response.json({ mode: await getEvolutionGroupMode(session.organizationId, group.group), available, canConfigure: canConfigure(session.role) });
  if (!available) return apiError(409, "groups_disabled", "O atendimento em grupos está desativado na conexão Evolution Go");
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  await setEvolutionGroupMode(session.organizationId, group.group, body.data.mode);
  publish(session.organizationId, { type: "conversation.updated", data: { conversation: { id: conversationId } } });
  return Response.json({ mode: body.data.mode, available: true, canConfigure: true });
}
