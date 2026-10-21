import { createHash } from "node:crypto";
import { z } from "zod";
import { evolutionRequest, type EvolutionAccess } from "./client";
import { evolutionEnabled } from "./flag";

/** Identidad independiente por grupo y participante: nunca es un teléfono. */
export function evolutionGroupTarget(identity: string) {
  const match = /^evo-group:(\d+(?:-\d+)?@g\.us):(\d+@(s\.whatsapp\.net|lid))$/.exec(identity);
  return match ? { group: match[1]!, participant: match[2]! } : null;
}

export function canonicalUserJid(value: string): string | null {
  const match = /^(\d+)(?::\d+)?@(s\.whatsapp\.net|lid)$/.exec(value);
  return match ? `${match[1]}@${match[2]}` : null;
}

export function groupBotJid(): string | null {
  if (!evolutionEnabled()) return null;
  const phone = process.env.EVOLUTION_GO_GROUP_BOT_NUMBER?.trim() ?? "";
  return /^\d{7,15}$/.test(phone) ? `${phone}@s.whatsapp.net` : null;
}

const userCheckSchema = z.object({
  Users: z.array(z.object({
    JID: z.string(),
    IsInWhatsapp: z.boolean(),
    LID: z.string().nullable().optional(),
  })),
});
const aliases = new Map<string, { expires: number; pending: Promise<string[]> }>();

/** Solo consulta el propio número; no manda mensajes ni enumera contactos. */
export async function groupBotAliases(access: EvolutionAccess, bot: string): Promise<string[]> {
  const key = createHash("sha256").update(JSON.stringify([access.baseUrl, access.token, bot])).digest("hex");
  const cached = aliases.get(key);
  if (cached && cached.expires > Date.now()) return cached.pending;
  if (aliases.size >= 32) aliases.delete(aliases.keys().next().value!);
  const entry = { expires: Date.now() + 300_000, pending: Promise.resolve([bot]) };
  // /user/info puede agotar el timeout consultando el propio número.
  // /user/check confirma número + LID sin consultar perfil ni dispositivos.
  entry.pending = evolutionRequest(access, "/user/check", userCheckSchema, { number: [bot.split("@")[0]!], formatJid: false })
    .then((result) => {
      const own = result.Users.find((user) => user.IsInWhatsapp && canonicalUserJid(user.JID) === bot);
      const lid = own?.LID ? canonicalUserJid(own.LID) : null;
      if (!lid?.endsWith("@lid")) entry.expires = Date.now() + 30_000;
      return lid?.endsWith("@lid") ? [bot, lid] : [bot];
    })
    .catch(() => { entry.expires = Date.now() + 30_000; return [bot]; });
  aliases.set(key, entry);
  return entry.pending;
}
