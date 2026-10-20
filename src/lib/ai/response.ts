/**
 * Lectura tolerante de la respuesta de un `/chat/completions`.
 *
 * Los routers OpenAI-compatibles (9router, LiteLLM, proxies propios) no
 * siempre contestan como OpenAI: algunos mandan SSE aunque nadie pidió
 * `stream`, otros envuelven un error en un 200, y una base URL mal puesta
 * devuelve el HTML del panel. Aquí se distingue cada caso para que la
 * pantalla diga QUÉ llegó en vez de un genérico «sin `choices`».
 */

export type ChatRead =
  | { ok: true; content: string }
  | { ok: false; kind: "html" | "error" | "sin_choices" | "vacio"; detail: string };

type Choice = {
  message?: { content?: unknown };
  delta?: { content?: unknown };
  text?: unknown;
};

const SNIPPET = 160;

function snippet(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > SNIPPET ? `${one.slice(0, SNIPPET)}…` : one;
}

function textOf(c: Choice | undefined): string {
  if (!c) return "";
  for (const v of [c.message?.content, c.delta?.content, c.text]) {
    if (typeof v === "string") return v;
    // Algunos proxies devuelven el contenido como partes [{type:"text",text}].
    if (Array.isArray(v)) {
      return v
        .map((p) => (p && typeof p === "object" && "text" in p ? String(p.text) : ""))
        .join("");
    }
  }
  return "";
}

/** Une los fragmentos `data: {...}` de un stream SSE en un solo texto. */
function fromSse(body: string): { content: string; frames: number } {
  let content = "";
  let frames = 0;
  for (const line of body.split(/\r?\n/)) {
    const m = /^data:\s?(.*)$/.exec(line.trim());
    if (!m || !m[1] || m[1] === "[DONE]") continue;
    try {
      const json = JSON.parse(m[1]) as { choices?: Choice[] };
      frames++;
      content += textOf(json.choices?.[0]);
    } catch {
      // Un frame roto no invalida los demás.
    }
  }
  return { content, frames };
}

export function readChatBody(body: string, contentType: string | null): ChatRead {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, kind: "vacio", detail: "resposta vazia" };

  const isSse = /text\/event-stream/i.test(contentType ?? "") || /^data:/m.test(trimmed);
  if (isSse) {
    const { content, frames } = fromSse(trimmed);
    if (content) return { ok: true, content };
    return {
      ok: false,
      kind: frames ? "sin_choices" : "vacio",
      detail: `stream SSE sem texto (${snippet(trimmed)})`,
    };
  }

  if (/^</.test(trimmed) || /text\/html/i.test(contentType ?? "")) {
    return { ok: false, kind: "html", detail: snippet(trimmed) };
  }

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return { ok: false, kind: "sin_choices", detail: snippet(trimmed) };
  }
  const obj = (json ?? {}) as { choices?: Choice[]; error?: unknown };
  const content = textOf(obj.choices?.[0]);
  if (content) return { ok: true, content };
  if (obj.error) {
    const e = obj.error as { message?: unknown };
    const msg = typeof e === "string" ? e : typeof e.message === "string" ? e.message : JSON.stringify(e);
    return { ok: false, kind: "error", detail: snippet(msg) };
  }
  return { ok: false, kind: "sin_choices", detail: snippet(trimmed) };
}

/** El mensaje para el dueño cuando la respuesta no se pudo leer. */
export function describeChatReadFailure(r: Extract<ChatRead, { ok: false }>): string {
  switch (r.kind) {
    case "html":
      return `O endereço respondeu com uma página web, não com a API. Use a URL da API do provedor (normalmente termina em /v1), não a do painel. Recebido: ${r.detail}`;
    case "error":
      return `O provedor respondeu com um erro: ${r.detail}`;
    case "vacio":
      return `O provedor respondeu sem conteúdo (${r.detail}). Verifique se o modelo existe nesse provedor.`;
    default:
      return `O provedor respondeu, mas não no formato da API da OpenAI (sem \`choices\`). Recebido: ${r.detail}`;
  }
}
