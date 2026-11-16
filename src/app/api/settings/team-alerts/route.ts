import { withAuth } from "@/lib/api";
import { evolutionEnabled } from "@/server/evolution/flag";
import { teamAlertsSettings } from "@/server/evolution/team-alerts-settings";

export const dynamic = "force-dynamic";
const authenticated = withAuth(teamAlertsSettings);
function handler(req: Request): Promise<Response> {
  return evolutionEnabled() ? authenticated(req) : Promise.resolve(new Response(null, { status: 404 }));
}
export const GET = handler;
export const PUT = handler;
export const POST = handler;
