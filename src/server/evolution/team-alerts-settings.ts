import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import type { SessionContext } from "@/lib/auth/session";
import { EvolutionError } from "./client";
import { getEvolutionByOrg } from "./credentials";
import { evolutionEnabled } from "./flag";
import {
  GROUP_JID_RE,
  REMINDER_MAX,
  REMINDER_MIN,
  TEST_TEXT,
  getTeamAlertSettings,
  listTeamGroups,
  saveTeamAlertSettings,
  sendTeamText,
} from "./team-alerts";

const putSchema = z
  .object({
    enabled: z.boolean(),
    groupJid: z.string().regex(GROUP_JID_RE).nullable(),
    groupName: z.string().trim().max(200).nullable(),
    reminderMinutes: z.number().int().min(REMINDER_MIN).max(REMINDER_MAX),
  })
  .strict()
  .refine((v) => !v.enabled || v.groupJid !== null, { message: "Escolha o grupo da equipe" });

/** Teste: o grupo geral ou o destino de um agente de área (grupo ou telefone). */
const postSchema = z
  .object({
    action: z.literal("test"),
    groupJid: z.string().regex(GROUP_JID_RE).optional(),
    destino: z.string().regex(/^(?:\d+(?:-\d+)?@g\.us|\d{10,15})$/).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.groupJid ?? v.destino), { message: "Escolha para onde mandar o teste" });

/** GET: configuração + grupos do número · PUT: salvar (admin) · POST: mensagem de teste (admin). */
export async function teamAlertsSettings(session: SessionContext, req: Request): Promise<Response> {
  if (!evolutionEnabled()) return new Response(null, { status: 404 });
  const org = session.organizationId;
  const creds = await getEvolutionByOrg(org);
  if (!creds) return apiError(409, "not_connected", "Conecte o Evolution Go antes de configurar os avisos");
  const access = { baseUrl: creds.baseUrl, token: creds.token };

  if (req.method === "GET") {
    const settings = await getTeamAlertSettings(org);
    let groups: { jid: string; name: string }[] = [];
    let groupsError: string | null = null;
    try {
      groups = await listTeamGroups(access);
    } catch (err) {
      groupsError =
        err instanceof EvolutionError
          ? "Não foi possível listar os grupos. Confira se o WhatsApp está conectado."
          : "Não foi possível listar os grupos.";
    }
    return Response.json({ settings, groups, groupsError, canConfigure: canConfigure(session.role) });
  }

  if (!canConfigure(session.role)) {
    return apiError(403, "forbidden", "Somente o administrador pode alterar os avisos da equipe");
  }

  if (req.method === "PUT") {
    const body = await parseBody(req, putSchema);
    if (!body.ok) return body.response;
    await saveTeamAlertSettings(org, body.data);
    return Response.json({ settings: await getTeamAlertSettings(org) });
  }

  if (req.method === "POST") {
    const body = await parseBody(req, postSchema);
    if (!body.ok) return body.response;
    try {
      await sendTeamText(access, (body.data.groupJid ?? body.data.destino)!, TEST_TEXT);
    } catch {
      return apiError(502, "send_failed", "O teste não foi enviado. Confira se o número do CRM está no grupo e conectado.");
    }
    return Response.json({ ok: true });
  }

  return new Response(null, { status: 405 });
}
