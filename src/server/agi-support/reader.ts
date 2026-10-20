import { createHash } from "node:crypto";
import { z } from "zod";

const articleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,100}$/),
    topic: z.string().max(100),
    title: z.string().min(1).max(300),
    keywords: z.array(z.string().max(100)).max(40),
    content: z.string().min(1).max(20_000),
    url: z.string().url(),
  })
  .refine(
    (article) =>
      article.url === `https://agiteam.app/negocio/suporte/guia/${article.id}`,
  );
export const supportSnapshotSchema = z
  .object({
    version: z.literal(1),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    articles: z.array(articleSchema).min(1).max(200),
  })
  .refine(
    (data) =>
      new Set(data.articles.map((a) => a.id)).size === data.articles.length,
  );
export type SupportArticle = z.infer<typeof articleSchema>;
type Snapshot = z.infer<typeof supportSnapshotSchema>;
export type SupportStatus =
  | "disabled"
  | "unconfigured"
  | "ready"
  | "cached"
  | "unavailable";
export type SupportKnowledge = {
  status: SupportStatus;
  articles: SupportArticle[];
  syncedAt: string | null;
  revision: string | null;
};
export type SupportConfig = {
  enabled: boolean;
  url: string;
  token: string;
  production?: boolean;
};
const TTL = 5 * 60_000;
const MAX_STALE = 60 * 60_000;
const RETRY_AFTER = 30_000;
const MAX_BYTES = 256_000;

function empty(status: SupportStatus): SupportKnowledge {
  return { status, articles: [], syncedAt: null, revision: null };
}
function validConfig(config: SupportConfig): boolean {
  if (config.token.length < 32 || config.token.length > 256) return false;
  try {
    const url = new URL(config.url);
    return (
      (url.protocol === "https:" ||
        (!config.production && url.protocol === "http:")) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
async function limitedJson(response: Response): Promise<unknown> {
  if (
    Number(response.headers.get("content-length")) > MAX_BYTES ||
    !response.body
  )
    throw new Error("invalid_body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("body_limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Caché editorial compartida: nunca contiene datos de usuarios u organizaciones. */
export function createSupportReader(options: {
  config: () => SupportConfig;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? fetch;
  type Slot = {
    snapshot?: Snapshot;
    fetchedAt: number;
    retryAt: number;
    pending?: Promise<SupportKnowledge>;
  };
  const slots = new Map<string, Slot>();
  function view(slot: Slot, status: SupportStatus): SupportKnowledge {
    return slot.snapshot
      ? {
          status,
          articles: slot.snapshot.articles,
          revision: slot.snapshot.revision,
          syncedAt: new Date(slot.fetchedAt).toISOString(),
        }
      : empty(status);
  }
  return async function read(): Promise<SupportKnowledge> {
    const config = options.config();
    if (!config.enabled) return empty("disabled");
    if (!validConfig(config)) return empty("unconfigured");
    const key = createHash("sha256")
      .update(`${config.url}\0${config.token}`)
      .digest("hex");
    let slot = slots.get(key);
    if (!slot) {
      slot = { fetchedAt: 0, retryAt: 0 };
      if (slots.size >= 2) slots.delete(slots.keys().next().value!);
      slots.set(key, slot);
    }
    const current = slot;
    if (current.snapshot && now() - current.fetchedAt < TTL)
      return view(current, "ready");
    if (current.pending) return current.pending;
    if (now() < current.retryAt)
      return current.snapshot && now() - current.fetchedAt < MAX_STALE
        ? view(current, "cached")
        : empty("unavailable");
    current.pending = (async () => {
      try {
        const response = await fetchImpl(config.url, {
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(5_000),
          redirect: "error",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("source_unavailable");
        const parsed = supportSnapshotSchema.safeParse(
          await limitedJson(response),
        );
        if (!parsed.success) throw new Error("invalid_snapshot");
        current.snapshot = parsed.data;
        current.fetchedAt = now();
        current.retryAt = 0;
        return view(current, "ready");
      } catch {
        // No propagar errores de red, cuerpo, token ni URL al prompt o a logs.
        current.retryAt = now() + RETRY_AFTER;
        return current.snapshot && now() - current.fetchedAt < MAX_STALE
          ? view(current, "cached")
          : empty("unavailable");
      }
    })();
    try {
      return await current.pending;
    } finally {
      current.pending = undefined;
    }
  };
}
export const readAgiSupport = createSupportReader({
  config: () => ({
    enabled: process.env.AGI_SUPPORT === "on",
    url: process.env.AGI_SUPPORT_URL?.trim() ?? "",
    token: process.env.AGI_SUPPORT_TOKEN?.trim() ?? "",
    production: process.env.NODE_ENV === "production",
  }),
});
