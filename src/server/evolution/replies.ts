import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { canonicalUserJid, evolutionGroupTarget } from "./groups";

/** Solo continúa al contestar una salida IA del mismo grupo y participante. */
export async function confirmedGroupReply(
  organizationId: string,
  group: string,
  sender: string,
  quotedId: string,
): Promise<boolean> {
  const participant = canonicalUserJid(sender);
  const identity = `evo-group:${group}:${participant}`;
  if (!participant || !evolutionGroupTarget(identity) || !quotedId || quotedId.length > 256) return false;
  const rows = await getDb()
    .select({ id: schema.message.id })
    .from(schema.message)
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .where(scoped(schema.message.organizationId, organizationId, and(
      eq(schema.conversation.organizationId, organizationId),
      eq(schema.contact.organizationId, organizationId),
      eq(schema.message.waMessageId, `evo:${quotedId}`),
      eq(schema.message.direction, "out"),
      eq(schema.message.aiGenerated, true),
      eq(schema.conversation.channel, "whatsapp"),
      eq(schema.conversation.isTest, false),
      eq(schema.conversation.channelThreadRef, group),
      eq(schema.contact.waIdentity, identity),
    )))
    .limit(1);
  return rows.length > 0;
}
