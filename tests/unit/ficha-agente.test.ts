import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { agentActionSchema } from "@/server/ai/actions";
import { buildAgentSystemPrompt, renderFichaParaModelo } from "@/server/ai/prompts";

/**
 * A ficha do lead pelo agente do CRM: qualquer ação pode trazer "ficha", o
 * turno a salva pela mesma porta do dono (`upsertFicha`) e o modelo recebe o
 * que já se sabe para não perguntar de novo.
 */

const eventos: string[] = [];
const upsertFicha = vi.fn();
vi.mock("@/server/bot/ficha", () => ({ upsertFicha }));
vi.mock("@/server/agi-support/reader", () => ({ readAgiSupport: async () => null }));
vi.mock("@/server/agi-support/context", () => ({ renderAgiSupport: () => "" }));

const sendText = vi.fn();
const graphRequest = vi.fn();
const chatJson = vi.fn();

vi.mock("@/server/inbox/send", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/inbox/send")>();
  return { ...original, sendText };
});

vi.mock("@/lib/meta/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/meta/client")>();
  return { ...original, graphRequest };
});

vi.mock("@/lib/ai", () => ({ chatJson }));

// #85 — la resolución del proveedor mira primero la fila de Ajustes → IA. Sin
// fila cae al entorno (`OPENROUTER_API_TOKEN`, abajo), sin tocar la cola de
// selects de la BD simulada.
vi.mock("@/server/ai/credentials", () => ({
  getAiCredentialPublic: async () => null,
  getAiCredentialSecret: async () => null,
}));

// BD simulada: cola de resultados de select + capturas de insert/update.
const selectQueue: unknown[][] = [];
const inserts: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserts.push(values);
        if (values.direction === "out") eventos.push(`persistido:${values.text}`);
        const chain = {
          onConflictDoNothing: () => chain,
          returning: () => Promise.resolve([values]),
          then: (resolve: (v: unknown) => void) =>
            Promise.resolve([values]).then(resolve),
        };
        return chain;
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        if (values.handoffReason) eventos.push(`handoff:${values.handoffReason}`);
        return {
          where: () => {
            const chain = {
              returning: () => Promise.resolve([{ id: "cv_1" }]),
              then: (resolve: (v: unknown) => void) =>
                Promise.resolve([{ id: "cv_1" }]).then(resolve),
            };
            return chain;
          },
        };
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          { get: (_t2, col) => `${String(tableName)}.${String(col)}` }
        ),
    }
  ),
}));


function conversacion(extra: Record<string, unknown> = {}) {
  return {
    id: "cv_1",
    organizationId: "org_1",
    contactId: "ct_1",
    channel: "whatsapp",
    channelThreadRef: "5511999990000@s.whatsapp.net",
    isTest: false,
    aiEnabled: true,
    handoffAt: null,
    handoffReason: null,
    lastInboundAt: new Date(),
    ...extra,
  };
}

const perfil = {
  id: "agp_1",
  organizationId: "org_1",
  enabled: true,
  name: "Asistente",
  tone: null,
  instructions: null,
  escalationRules: null,
  greeting: null,
};

/** conversa, perfil, histórico, kb, etapas e a ficha atual do contato. */
function turno(conv = conversacion(), ficha: Record<string, unknown> | null = null) {
  selectQueue.push(
    [conv],
    [perfil],
    [{ id: "msg_1", direction: "in", text: "sou a Ana, de Orlando", createdAt: new Date() }],
    [],
    [{ id: "st_1", name: "Novo" }],
    [{ ficha }]
  );
}

let runAgentTurn: (conversationId: string) => Promise<unknown>;

describe("a ficha no turno do agente", () => {
  beforeAll(async () => {
    ({ runAgentTurn } = await import("@/server/ai/pipeline"));
  }, 60_000);

  beforeEach(() => {
    eventos.length = 0;
    selectQueue.length = 0;
    inserts.length = 0;
    updates.length = 0;
    sendText.mockReset();
    sendText.mockResolvedValue({ messageId: "msg_out" });
    chatJson.mockReset();
    upsertFicha.mockReset();
    upsertFicha.mockResolvedValue({ ficha: {} });
    vi.stubEnv("OPENROUTER_API_TOKEN", "token-test");
    // O job «completo» do CI liga a agenda, que lê ofertas do banco simulado.
    vi.stubEnv("AGENDA", "");
  });

  it("salva a ficha que vem junto com a resposta, e a resposta sai igual", async () => {
    chatJson.mockResolvedValue({
      ok: true,
      data: { action: "reply", text: "Oi Ana!", ficha: { nome: "Ana", cidade: "Orlando" } },
    });
    turno();
    await runAgentTurn("cv_1");

    expect(upsertFicha).toHaveBeenCalledWith({
      organizationId: "org_1",
      contactId: "ct_1",
      ficha: { nome: "Ana", cidade: "Orlando" },
    });
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ text: "Oi Ana!" }));
  });

  it("o modelo recebe a ficha atual no fim do turno", async () => {
    chatJson.mockResolvedValue({ ok: true, data: { action: "reply", text: "Oi" } });
    turno(conversacion(), { cidade: "Orlando" });
    await runAgentTurn("cv_1");

    const mensagens = chatJson.mock.calls[0]![1] as { role: string; content: string }[];
    expect(mensagens.some((m) => m.content.includes("- cidade: Orlando"))).toBe(true);
    expect(upsertFicha).not.toHaveBeenCalled();
  });

  it("se salvar a ficha falha, o cliente recebe a resposta mesmo assim", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    upsertFicha.mockRejectedValue(new Error("db caiu"));
    chatJson.mockResolvedValue({
      ok: true,
      data: { action: "reply", text: "Oi Ana!", ficha: { nome: "Ana" } },
    });
    turno();
    await runAgentTurn("cv_1");
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ text: "Oi Ana!" }));
  });

  it("em grupo não há ficha: nem salva nem mostra", async () => {
    chatJson.mockResolvedValue({
      ok: true,
      data: { action: "reply", text: "Oi", ficha: { nome: "Ana" } },
    });
    selectQueue.push(
      [conversacion({ channelThreadRef: "123@g.us" })],
      [perfil],
      [{ id: "msg_1", direction: "in", text: "oi", createdAt: new Date() }],
      [],
      [{ id: "st_1", name: "Novo" }]
    );
    await runAgentTurn("cv_1");
    expect(upsertFicha).not.toHaveBeenCalled();
    const mensagens = chatJson.mock.calls[0]![1] as { content: string }[];
    expect(mensagens.some((m) => m.content.startsWith("FICHA DO LEAD"))).toBe(false);
  });
});

describe("o esquema e o prompt da ficha", () => {
  it("qualquer ação aceita ficha; ficha mal formada é descartada sem derrubar a ação", () => {
    const s = agentActionSchema(true);
    expect(s.parse({ action: "handoff", ficha: { servico: "piscina" } })).toMatchObject({
      ficha: { servico: "piscina" },
    });
    const r = s.parse({ action: "reply", text: "oi", ficha: "Ana" });
    expect(r).toMatchObject({ action: "reply", text: "oi" });
    expect((r as { ficha?: unknown }).ficha).toBeUndefined();
  });

  it("o prompt ensina a ficha em conversa individual e não em grupo", () => {
    const base = {
      profile: perfil as unknown as Parameters<typeof buildAgentSystemPrompt>[0]["profile"],
      kb: [],
      stages: [{ name: "Novo" }],
    };
    expect(buildAgentSystemPrompt(base)).toMatch(/"ficha"/);
    expect(buildAgentSystemPrompt({ ...base, group: true })).not.toMatch(/"ficha"/);
  });

  it("renderFichaParaModelo lista o que se sabe e avisa quando está vazia", () => {
    expect(renderFichaParaModelo({ nome: "Ana", orcamento: 300, vazio: "" })).toBe(
      "FICHA DO LEAD (o que já se sabe deste cliente; não pergunte de novo):\n- nome: Ana\n- orcamento: 300"
    );
    expect(renderFichaParaModelo(null)).toBe("FICHA DO LEAD: ainda vazia.");
  });
});
