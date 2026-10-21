import { withAuth } from "@/lib/api";
import { evolutionEnabled } from "@/server/evolution/flag";
import { evolutionGroupModeSettings } from "@/server/evolution/group-mode-settings";

export const dynamic = "force-dynamic";
const authenticated = withAuth(async (session, req: Request, ctx: { params: Promise<{ id: string }> }) => evolutionGroupModeSettings(session, req, (await ctx.params).id));
function handler(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return evolutionEnabled() ? authenticated(req, ctx) : Promise.resolve(new Response(null, { status: 404 }));
}
export const GET = handler;
export const PATCH = handler;
