import { describe, expect, it } from "vitest";
import { describeChatReadFailure, readChatBody } from "@/lib/ai/response";
import { probeProvider } from "@/lib/ai/probe";

/**
 * Routers OpenAI-compatibles (9router, LiteLLM…) que no contestan como OpenAI:
 * SSE sin haberlo pedido, un error envuelto en 200 o el HTML del panel.
 */
describe("readChatBody", () => {
  it("JSON de OpenAI", () => {
    const body = JSON.stringify({ choices: [{ message: { content: "ok" } }] });
    expect(readChatBody(body, "application/json")).toEqual({ ok: true, content: "ok" });
  });

  it("SSE aunque no se pidió stream: une los deltas", () => {
    const body = [
      'data: {"choices":[{"delta":{"content":"o"}}]}',
      'data: {"choices":[{"delta":{"content":"k"}}]}',
      "data: [DONE]",
    ].join("\n\n");
    expect(readChatBody(body, "text/event-stream")).toEqual({ ok: true, content: "ok" });
    // Sin content-type correcto también se reconoce por el `data:`.
    expect(readChatBody(body, "text/plain")).toEqual({ ok: true, content: "ok" });
  });

  it("contenido en partes [{type, text}]", () => {
    const body = JSON.stringify({
      choices: [{ message: { content: [{ type: "text", text: "o" }, { type: "text", text: "k" }] } }],
    });
    expect(readChatBody(body, "application/json")).toEqual({ ok: true, content: "ok" });
  });

  it("HTML del panel: lo dice y sugiere la URL de la API", () => {
    const r = readChatBody("<!doctype html><html><body>9router</body></html>", "text/html");
    expect(r).toMatchObject({ ok: false, kind: "html" });
    if (!r.ok) expect(describeChatReadFailure(r)).toMatch(/\/v1/);
  });

  it("error envuelto en 200: muestra el mensaje del proveedor", () => {
    const r = readChatBody(JSON.stringify({ error: { message: "model not found" } }), "application/json");
    expect(r).toMatchObject({ ok: false, kind: "error" });
    if (!r.ok) expect(describeChatReadFailure(r)).toContain("model not found");
  });
});

describe("probeProvider con un router que responde SSE", () => {
  it("pide stream:false y acepta el SSE igual", async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as typeof fetch;
    const r = await probeProvider({
      baseUrl: "http://router:20128/v1",
      model: "cc/claude-sonnet-4",
      token: "sk-x",
      fetchImpl,
    });
    expect(sent.stream).toBe(false);
    expect(r.ok).toBe(true);
  });
});
