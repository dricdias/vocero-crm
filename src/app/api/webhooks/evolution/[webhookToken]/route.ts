import { after } from "next/server";
import { evolutionEnabled } from "@/server/evolution/flag";
import { getEvolutionByWebhook } from "@/server/evolution/credentials";
import { evolutionEventSchema, processEvolutionEvent, sameToken } from "@/server/evolution/webhook";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: {params: Promise<{webhookToken: string}>}) {
  if (!evolutionEnabled()) return new Response(null, {status: 404});
  const creds = await getEvolutionByWebhook((await params).webhookToken);
  if (!creds) return new Response(null, {status: 404});
  const parsed = evolutionEventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !sameToken(parsed.data.instanceToken, creds.token)) return new Response(null, {status: 401});
  after(async () => {
    try { await processEvolutionEvent(creds, parsed.data); }
    catch { console.error("[evolution] No se pudo procesar el evento; revisar conexión y base de datos"); }
  });
  return Response.json({received: true});
}
