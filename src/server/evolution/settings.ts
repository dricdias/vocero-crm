import { withWhatsappConnectionLock } from "@/server/whatsapp/connection-lock";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import type { SessionContext } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { getEnv } from "@/lib/env";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";
import {
  baseUrlSchema,
  evolutionRequest,
  EvolutionError,
  getEvolutionStatus,
  qrSchema,
} from "./client";
import {
  deleteEvolution,
  getEvolutionByOrg,
  getEvolutionDoAgente,
  saveEvolution,
  setEvolutionStatus,
  tokenEmUso,
} from "./credentials";
import { evolutionEnabled } from "./flag";

const configSchema = z.object({
  baseUrl: baseUrlSchema,
  token: z.string().trim().min(1).max(4096),
});
const actionSchema = z.object({ action: z.enum(["qr", "status"]) });
/** O número principal da org (Configurações → WhatsApp). */
export async function evolutionSettings(
  session: SessionContext,
  req: Request,
): Promise<Response> {
  return evolutionSettingsDoNumero(session, req, null);
}

/**
 * O mesmo fluxo para o número principal (`agenteAreaId` null) ou para o
 * número próprio de um agente de área. Quem chama confere que o agente é da org.
 */
export async function evolutionSettingsDoNumero(
  session: SessionContext,
  req: Request,
  agenteAreaId: string | null,
): Promise<Response> {
  if (!evolutionEnabled()) return new Response(null, { status: 404 });
  if (!canConfigure(session.role))
    return apiError(
      403,
      "forbidden",
      "Somente o administrador pode configurar o WhatsApp",
    );
  if (req.method === "PUT" || req.method === "DELETE")
    return withWhatsappConnectionLock(session.organizationId, () =>
      handleSettings(session, req, agenteAreaId),
    );
  return handleSettings(session, req, agenteAreaId);
}
async function handleSettings(
  session: SessionContext,
  req: Request,
  agenteAreaId: string | null,
): Promise<Response> {
  if (!evolutionEnabled()) return new Response(null, { status: 404 });
  if (!canConfigure(session.role))
    return apiError(
      403,
      "forbidden",
      "Somente o administrador pode configurar o WhatsApp",
    );
  const org = session.organizationId;
  const lerNumero = () =>
    agenteAreaId ? getEvolutionDoAgente(org, agenteAreaId) : getEvolutionByOrg(org);
  const qual = { agenteAreaId };
  try {
    if (req.method === "GET") {
      const creds = await lerNumero();
      return Response.json({
        connection: creds
          ? {
              baseUrl: creds.baseUrl,
              status: creds.status,
              tokenLast4: creds.token.slice(-4),
            }
          : null,
      });
    }
    if (req.method === "DELETE") {
      // Desvincula SOLO el CRM; no cierra la sesión del teléfono ni borra el historial.
      await deleteEvolution(org, agenteAreaId);
      return Response.json({ ok: true });
    }
    if (req.method === "PUT") {
      const body = await parseBody(req, configSchema);
      if (!body.ok) return body.response;
      if (await getCredentialsByOrg(org))
        return apiError(
          409,
          "provider_conflict",
          "Desconecte a Meta antes de ativar o Evolution Go",
        );
      if (agenteAreaId && !(await getEvolutionByOrg(org)))
        return apiError(
          409,
          "principal_required",
          "Conecte primeiro o número principal em Configurações → WhatsApp",
        );
      const access = body.data;
      if (await tokenEmUso(org, access.token, agenteAreaId))
        return apiError(
          409,
          "token_in_use",
          "Esta instância já está ligada a outro número do CRM. Crie uma instância nova no Evolution Go para este agente.",
        );
      const status = await getEvolutionStatus(access);
      const webhookToken = randomBytes(32).toString("hex");
      // Guardar antes del connect: los primeros eventos ya deben poder resolverse.
      await saveEvolution({
        organizationId: org,
        ...access,
        webhookToken,
        connected: status.Connected && status.LoggedIn,
        agenteAreaId,
      });
      try {
        await evolutionRequest(
          access,
          "/instance/connect",
          z.object({}).passthrough(),
          {
            webhookUrl: `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/api/webhooks/evolution/${webhookToken}`,
            subscribe: ["MESSAGE", "READ_RECEIPT", "CONNECTION", "QRCODE"],
          },
        );
      } catch {
        await setEvolutionStatus(org, false, qual);
        return apiError(
          502,
          "webhook_failed",
          "Credencial salva, mas o Evolution Go não confirmou a conexão e o webhook. Salve novamente para tentar outra vez.",
        );
      }
      return Response.json({ ok: true });
    }
    const body = await parseBody(req, actionSchema);
    if (!body.ok) return body.response;
    const creds = await lerNumero();
    if (!creds)
      return apiError(
        409,
        "not_connected",
        "Primeiro salve a conexão Evolution Go",
      );
    if (body.data.action === "qr") {
      const qr = await evolutionRequest(creds, "/instance/qr", qrSchema);
      if (qr.passkeyStage)
        return apiError(
          409,
          "passkey_required",
          "Conclua a passkey no painel Evolution Go e consulte o estado novamente.",
        );
      // Solo imágenes inline: nunca permite que una URL remota reciba credenciales del navegador.
      return Response.json({
        qrcode: qr.qrcode?.startsWith("data:image/png;base64,")
          ? qr.qrcode
          : null,
        code: qr.code ?? null,
      });
    }
    const status = await getEvolutionStatus(creds);
    const connected = status.Connected && status.LoggedIn;
    await setEvolutionStatus(org, connected, qual);
    return Response.json({ connected, name: status.Name ?? null });
  } catch (error) {
    return apiError(
      502,
      "evolution_error",
      error instanceof EvolutionError
        ? error.message
        : "Não foi possível consultar o Evolution Go",
    );
  }
}
