import { withAuth } from "@/lib/api";
import { listConversations } from "@/server/inbox/queries";
import { withPins } from "@/server/inbox/pins";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined
  );
  // 070 — os fixados são de cada pessoa da equipe.
  return Response.json({
    conversations: await withPins(conversations, session.organizationId, session.userId),
  });
});
