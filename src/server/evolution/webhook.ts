import { encryptSecret } from "@/lib/crypto";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizeMx } from "@/lib/meta/client";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { applyStatusUpdate } from "@/server/inbox/status";
import { setEvolutionStatus, type EvolutionCredentials } from "./credentials";
import { canonicalUserJid, groupBotAliases, groupBotJid } from "./groups";
import { confirmedGroupReply } from "./replies";
import { getEvolutionGroupMode } from "./group-mode";
import { evolutionGroupJidSchema } from "@/lib/evolution-group-mode";

export const evolutionEventSchema = z.object({
  event: z.string(),
  instanceToken: z.string(),
  data: z.unknown(),
});
export function sameToken(actual: string, expected: string): boolean {
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
const messageSchema = z.object({
  quoted: z.unknown().optional(),
  Info: z.object({
    ID: z.string().min(1),
    Chat: z.string(),
    Sender: z.string().optional(),
    IsFromMe: z.boolean(),
    IsGroup: z.boolean(),
    Timestamp: z.union([z.string(), z.number()]),
    PushName: z.string().optional(),
  }),
  Message: z
    .object({
      conversation: z.string().optional(),
      extendedTextMessage: z
        .object({ text: z.string().optional() })
        .passthrough()
        .optional(),
    })
    .passthrough(),
});
const receiptSchema = z.object({
  MessageIDs: z.array(z.string()),
  Type: z.string(),
  Timestamp: z.union([z.string(), z.number()]).optional(),
});

/** No inspecciona quotedMessage: citar una mención no convoca al bot. */
const mentionContextSchema = z.object({
  contextInfo: z.object({ mentionedJID: z.array(z.string()).max(1024).optional() }).optional(),
});
function mentionsIn(message: Record<string, unknown>): string[] {
  const contexts = [
    "extendedTextMessage", "imageMessage", "videoMessage",
    "documentMessage", "audioMessage", "stickerMessage",
  ];
  return contexts.flatMap((key) => {
    const parsed = mentionContextSchema.safeParse(message[key]);
    return parsed.success ? parsed.data.contextInfo?.mentionedJID ?? [] : [];
  });
}

const quoteSchema = z.object({ stanzaID: z.string().min(1).max(256) });
function quotedIdIn(data: z.infer<typeof messageSchema>): string | null {
  // Evolution también entrega la cita normalizada en data.quoted.
  const top = quoteSchema.safeParse(data.quoted);
  if (top.success) return top.data.stanzaID;
  for (const kind of ["extendedTextMessage", "imageMessage", "videoMessage", "documentMessage", "audioMessage", "stickerMessage"]) {
    const parsed = z.object({ contextInfo: quoteSchema }).safeParse(data.Message[kind]);
    if (parsed.success) return parsed.data.contextInfo.stanzaID;
  }
  return null;
}

/** Pura: solo las menciones explícitas al bot abren un hilo de grupo. */
export function incomingEvolution(data: unknown, botJids: readonly string[] = [], groupAuthorized = false) {
  const parsed = messageSchema.safeParse(data);
  if (!parsed.success) return null;
  const { Info: info, Message: message } = parsed.data;
  if (
    info.IsFromMe ||
    (!info.IsGroup && !/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(info.Chat))
  )
    return null;
  const sender = info.Sender ? canonicalUserJid(info.Sender) : null;
  if (info.IsGroup) {
    const mentions = mentionsIn(message);
    const bots = new Set(botJids.map(canonicalUserJid).filter(Boolean));
    if (
      !/^\d+(?:-\d+)?@g\.us$/.test(info.Chat) || !sender ||
      (!mentions.some((jid) => bots.has(canonicalUserJid(jid))) && !(groupAuthorized && bots.size > 0))
    ) return null;
  }
  const rawId = info.Chat.split("@")[0]!.split(":")[0]!;
  const phone = info.IsGroup || info.Chat.endsWith("@lid") ? null : normalizeMx(rawId);
  const identity = info.IsGroup ? `evo-group:${info.Chat}:${sender}` : phone ?? `evo-lid:${rawId}`;
  const timestamp =
    typeof info.Timestamp === "number"
      ? info.Timestamp
      : Date.parse(info.Timestamp) / 1000;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const mediaTypes = [
    "image",
    "audio",
    "video",
    "document",
    "sticker",
  ] as const;
  const kind = mediaTypes.find(
    (t) => typeof message[`${t}Message`] === "object",
  );
  const metadata = kind
    ? z
        .object({
          mimetype: z.string().optional(),
          fileName: z.string().optional(),
          caption: z.string().optional(),
        })
        .safeParse(message[`${kind}Message`])
    : null;
  const details = metadata?.success ? metadata.data : null;
  return {
    identity: {
      identity,
      phone,
      waUserId: null,
      profileName: info.IsGroup ? `${info.PushName || "Participante"} (grupo)` : info.PushName ?? null,
    },
    ...(info.IsGroup ? { threadRef: info.Chat } : {}),
    waMessageId: `evo:${info.ID}`,
    timestamp: String(timestamp),
    type: kind ?? "text",
    text:
      message.conversation ??
      message.extendedTextMessage?.text ??
      details?.caption ??
      (kind ? null : "[Mensagem não compatível com Evolution Go]"),
    media: kind
      ? {
          kind,
          waMediaId: `evo:${info.ID}`,
          mimeType: details?.mimetype ?? null,
          fileName: details?.fileName ?? null,
          caption: details?.caption ?? null,
          payload: { evolutionMessage: message },
          fetchStatus: "pending" as const,
        }
      : null,
  };
}
export async function processEvolutionEvent(
  creds: EvolutionCredentials,
  event: z.infer<typeof evolutionEventSchema>,
) {
  if (
    event.event === "Connected" ||
    event.event === "Disconnected" ||
    event.event === "LoggedOut" ||
    event.event === "ConnectFailure" ||
    event.event === "TemporaryBan"
  ) {
    await setEvolutionStatus(creds.organizationId, event.event === "Connected");
    return;
  }
  if (event.event === "Message") {
    const parsed = messageSchema.safeParse(event.data);
    let botJids: string[] = [];
    let allMessages = false;
    const bot = groupBotJid();
    if (parsed.success && parsed.data.Info.IsGroup && !parsed.data.Info.IsFromMe && bot) {
      if (!evolutionGroupJidSchema.safeParse(parsed.data.Info.Chat).success || !canonicalUserJid(parsed.data.Info.Sender ?? "")) return;
      allMessages = await getEvolutionGroupMode(creds.organizationId, parsed.data.Info.Chat) === "all";
      const mentions = mentionsIn(parsed.data.Message);
      botJids = [bot];
      if (
        !allMessages && mentions.some((jid) => canonicalUserJid(jid)?.endsWith("@lid")) &&
        !mentions.some((jid) => canonicalUserJid(jid) === bot)
      ) botJids = await groupBotAliases(creds, bot);
    }
    let incoming = incomingEvolution(event.data, botJids, allMessages);
    if (!incoming && parsed.success && parsed.data.Info.IsGroup && !parsed.data.Info.IsFromMe && bot) {
      const quotedId = quotedIdIn(parsed.data);
      const sender = parsed.data.Info.Sender;
      if (quotedId && sender && await confirmedGroupReply(creds.organizationId, parsed.data.Info.Chat, sender, quotedId)) {
        incoming = incomingEvolution(event.data, [bot], true);
      }
    }
    if (incoming?.media) {
      const encrypted = encryptSecret(
        JSON.stringify(incoming.media.payload.evolutionMessage),
      );
      Object.assign(incoming.media, {
        payload: {
          evolutionCipher: encrypted.cipher,
          evolutionIv: encrypted.iv,
          evolutionTag: encrypted.tag,
        },
      });
    }
    if (incoming)
      await ingestInboundMessage({
        organizationId: creds.organizationId,
        ...incoming,
      });
  }
  if (event.event === "Receipt") {
    const parsed = receiptSchema.safeParse(event.data);
    if (!parsed.success) return;
    const status =
      parsed.data.Type === "read" || parsed.data.Type === "played"
        ? "read"
        : parsed.data.Type === "" || parsed.data.Type === "delivered"
          ? "delivered"
          : null;
    if (!status) return;
    for (const id of parsed.data.MessageIDs)
      await applyStatusUpdate(creds.organizationId, {
        id: `evo:${id}`,
        status,
        timestamp: String(parsed.data.Timestamp ?? ""),
      });
  }
}
