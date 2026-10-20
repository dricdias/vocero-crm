import { withAuth } from "@/lib/api";
import { evolutionSettings } from "@/server/evolution/settings";
import { evolutionEnabled } from "@/server/evolution/flag";
export const dynamic = "force-dynamic";
const authenticated = withAuth(evolutionSettings);
function handler(req: Request): Promise<Response> {
  return evolutionEnabled() ? authenticated(req) : Promise.resolve(new Response(null, {status: 404}));
}
export const GET = handler;
export const PUT = handler;
export const POST = handler;
export const DELETE = handler;
