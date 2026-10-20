import { encryptSecret } from "@/lib/crypto";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizeMx } from "@/lib/meta/client";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { applyStatusUpdate } from "@/server/inbox/status";
import { setEvolutionStatus, type EvolutionCredentials } from "./credentials";

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
      extendedTextMessage: z.object({ text: z.string().optional() }).optional(),
    })
    .passthrough(),
});
const receiptSchema = z.object({
  MessageIDs: z.array(z.string()),
  Type: z.string(),
  Timestamp: z.union([z.string(), z.number()]).optional(),
});

/** Pura: los grupos, ecos propios y JID sin teléfono no activan el agente. */
export function incomingEvolution(data: unknown) {
  const parsed = messageSchema.safeParse(data);
  if (!parsed.success) return null;
  const { Info: info, Message: message } = parsed.data;
  if (
    info.IsFromMe ||
    info.IsGroup ||
    !/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(info.Chat)
  )
    return null;
  const rawId = info.Chat.split("@")[0]!.split(":")[0]!;
  const phone = info.Chat.endsWith("@lid") ? null : normalizeMx(rawId);
  const identity = phone ?? `evo-lid:${rawId}`;
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
      profileName: info.PushName ?? null,
    },
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
    const incoming = incomingEvolution(event.data);
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
