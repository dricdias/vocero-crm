import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { IMAGEN_ADJUNTA } from "@/lib/imagen-adjunta";
import { ensureAssetAvailable, readMediaFile } from "@/server/whatsapp/media";
import { SendError, sendMediaMessage } from "./send";

/** 042 — Un reenvío que no puede salir; el código va tal cual a la API. */
export class ForwardImageError extends Error {
  constructor(
    public status: 404 | 410 | 422,
    public code: "not_found" | "gone" | "invalid",
    message: string
  ) {
    super(message);
    this.name = "ForwardImageError";
  }
}

/**
 * 042 — Reenvía la imagen de un mensaje del historial a otra conversación.
 *
 * El cliente solo nombra el mensaje de origen: nunca una URL ni una ruta. El
 * binario se lee del almacén de la instancia (disco o bucket, 037) y sale como
 * un adjunto nuevo por `sendMediaMessage`, con todas sus guardas (sandbox,
 * ventana, canal, credenciales). El original no cambia: editar el pie solo
 * toca la copia.
 */
export async function forwardImage(input: {
  organizationId: string;
  conversationId: string;
  sourceMessageId: string;
  caption?: string;
}): Promise<{ messageId: string }> {
  const rows = await getDb()
    .select({
      message: schema.message,
      asset: schema.mediaAsset,
      conversation: schema.conversation,
    })
    .from(schema.message)
    .innerJoin(
      schema.mediaAsset,
      and(
        eq(schema.message.mediaAssetId, schema.mediaAsset.id),
        eq(schema.mediaAsset.organizationId, input.organizationId)
      )
    )
    .innerJoin(
      schema.conversation,
      and(
        eq(schema.message.conversationId, schema.conversation.id),
        eq(schema.conversation.organizationId, input.organizationId)
      )
    )
    .where(
      scoped(
        schema.message.organizationId,
        input.organizationId,
        eq(schema.message.id, input.sourceMessageId)
      )
    )
    .limit(1);
  const source = rows[0];
  if (!source) throw new ForwardImageError(404, "not_found", "Imagen no encontrada");
  if (source.conversation.isTest) {
    throw new SendError("sandbox_violation", "No se reenvían imágenes del Laboratorio");
  }
  if (source.message.conversationId === input.conversationId) {
    throw new ForwardImageError(422, "invalid", "Elige otra conversación para reenviar la imagen");
  }

  const asset = source.asset;
  if (asset.kind !== "image" || !asset.mimeType || !IMAGEN_ADJUNTA.mimes.test(asset.mimeType)) {
    throw new ForwardImageError(422, "invalid", "Este mensaje no trae una imagen que se pueda reenviar");
  }
  // Una imagen entrante que todavía no se bajó de Meta se baja ahora, como la
  // pide la bandeja al pintarla.
  if (asset.fetchStatus !== "available") {
    const ready = await ensureAssetAvailable(input.organizationId, asset.id);
    if (!ready) {
      throw new ForwardImageError(410, "gone", "La imagen ya no está disponible para reenviar");
    }
  }
  let data: Buffer;
  try {
    data = await readMediaFile(input.organizationId, asset.id);
  } catch {
    throw new ForwardImageError(410, "gone", "El archivo de la imagen ya no está disponible");
  }

  return sendMediaMessage({
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    file: { data, mimeType: asset.mimeType, fileName: asset.fileName ?? undefined },
    // Sin `caption` se conserva el del original; con «» se manda sin pie.
    caption: (input.caption ?? asset.caption ?? "") || undefined,
  });
}
