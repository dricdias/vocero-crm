import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { apiError } from "@/lib/api";
import { ensureAssetAvailable, readMediaFile } from "@/server/whatsapp/media";
import { evolutionEnabled } from "./flag";

/** Descarga privada para el cerebro externo; nunca entrega claves del protocolo. */
export async function evolutionBotMedia(
  organizationId: string,
  mediaId: string,
): Promise<Response> {
  if (!evolutionEnabled()) return new Response(null, { status: 404 });
  if (!/^evo:[\w.-]{1,128}$/.test(mediaId))
    return apiError(422, "invalid", "mediaId inválido");
  const [row] = await getDb()
    .select({ id: schema.mediaAsset.id })
    .from(schema.mediaAsset)
    .where(
      scoped(
        schema.mediaAsset.organizationId,
        organizationId,
        eq(schema.mediaAsset.waMediaId, mediaId),
      ),
    )
    .limit(1);
  if (!row) return apiError(404, "not_found", "Anexo não encontrado");
  const asset = await ensureAssetAvailable(organizationId, row.id);
  if (!asset)
    return apiError(
      502,
      "media_download_failed",
      "Não foi possível baixar o anexo do Evolution Go",
    );
  if ((asset.fileSize ?? 0) > 16 * 1024 * 1024)
    return apiError(413, "too_large", "O anexo excede o limite de 16 MB");
  try {
    const data = await readMediaFile(organizationId, row.id);
    if (data.byteLength > 16 * 1024 * 1024)
      return apiError(413, "too_large", "O anexo excede o limite de 16 MB");
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": asset.mimeType ?? "application/octet-stream",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return apiError(502, "media_download_failed", "Não foi possível ler o anexo");
  }
}
