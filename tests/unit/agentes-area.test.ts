import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSUNTO_PRINCIPAL,
  outrosAgentes,
  perfilDoTurno,
  resolverDestino,
  type AgenteArea,
} from "@/server/ai/agentes";
import { agentActionSchema } from "@/server/ai/actions";
import { buildAgentSystemPrompt } from "@/server/ai/prompts";
import { textoTransferencia } from "@/lib/eventos-hilo";

/**
 * Agentes por área num número só: o principal recebe, passa para a área
 * quando o assunto é dela, e o novo agente responde no mesmo turno.
 */

const h = vi.hoisted(() => ({
  listarAgentesArea: vi.fn(),
  transferirConversa: vi.fn(),
  sendText: vi.fn(),
  chatJson: vi.fn(),
  selectQueue: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@/server/ai/agentes", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/ai/agentes")>();
  return {
    ...original,
    listarAgentesArea: h.listarAgentesArea,
    transferirConversa: h.transferirConversa,
  };
});
vi.mock("@/server/bot/ficha", () => ({ upsertFicha: vi.fn() }));
vi.mock("@/server/agi-support/reader", () => ({ readAgiSupport: async () => null }));
vi.mock("@/server/agi-support/context", () => ({ renderAgiSupport: () => "" }));
vi.mock("@/server/inbox/send", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/inbox/send")>();
  return { ...original, sendText: h.sendText };
});
vi.mock("@/lib/ai", () => ({ chatJson: h.chatJson }));
vi.mock("@/server/ai/credentials", () => ({
  getAiCredentialPublic: async () => null,
  getAiCredentialSecret: async () => null,
}));
vi.mock("@/server/events/bus", () => ({ publish: vi.fn() }));

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
    select: () => thenableChain(h.selectQueue.shift() ?? []),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        const chain = {
          onConflictDoNothing: () => chain,
          returning: () => Promise.resolve([values]),
          then: (resolve: (v: unknown) => void) => Promise.resolve([values]).then(resolve),
        };
        return chain;
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        h.updates.push(values);
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
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

const financeiro: AgenteArea = {
  id: "aga_fin",
  organizationId: "org_1",
  nome: "Financeiro",
  assunto: "boletos e pagamentos",
  tom: null,
  instrucoes: "Nunca prometa desconto.",
  regrasEscalonamento: null,
  ativo: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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
    agenteAreaId: null,
    lastInboundAt: new Date(),
    ...extra,
  };
}

const perfil = {
  id: "agp_1",
  organizationId: "org_1",
  enabled: true,
  name: "Ana",
  tone: "simpático",
  instructions: "Somos a Piscinas Sol.",
  escalationRules: null,
  greeting: null,
};

/** conversa, perfil, histórico, kb, etapas e a ficha do contato. */
function turno(conv = conversacion()) {
  h.selectQueue.push(
    [conv],
    [perfil],
    [{ id: "msg_1", direction: "in", text: "quero a segunda via do boleto", createdAt: new Date() }],
    [],
    [{ id: "st_1", name: "Novo" }],
    [{ ficha: null }]
  );
}

type Msg = { content: string };
const mensagensDa = (n: number) => h.chatJson.mock.calls[n]![1] as Msg[];

let runAgentTurn: (conversationId: string) => Promise<unknown>;

describe("transferência entre agentes no turno", () => {
  beforeAll(async () => {
    ({ runAgentTurn } = await import("@/server/ai/pipeline"));
  }, 60_000);

  beforeEach(() => {
    h.selectQueue.length = 0;
    h.updates.length = 0;
    h.sendText.mockReset();
    h.sendText.mockResolvedValue({ messageId: "msg_out" });
    h.chatJson.mockReset();
    h.listarAgentesArea.mockReset();
    h.listarAgentesArea.mockResolvedValue([financeiro]);
    h.transferirConversa.mockReset();
    h.transferirConversa.mockResolvedValue(true);
    vi.stubEnv("OPENROUTER_API_TOKEN", "token-test");
    // O job «completo» do CI liga a agenda, que lê ofertas do banco simulado.
    vi.stubEnv("AGENDA", "");
  });

  it("o principal transfere e o Financeiro responde no mesmo turno", async () => {
    h.chatJson
      .mockResolvedValueOnce({
        ok: true,
        data: { action: "transfer", agent: "financeiro", reason: "segunda via" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { action: "reply", text: "Oi, aqui é o Financeiro! Já te mando a segunda via." },
      });
    turno();
    // O segundo turno relê a conversa, agora com o Financeiro.
    turno(conversacion({ agenteAreaId: "aga_fin" }));
    await runAgentTurn("cv_1");

    expect(h.transferirConversa).toHaveBeenCalledWith({
      organizationId: "org_1",
      conversationId: "cv_1",
      para: { id: "aga_fin", nome: "Financeiro", assunto: "boletos e pagamentos" },
      deNome: "Ana",
      origem: "ia",
      motivo: "segunda via",
    });
    expect(h.sendText).toHaveBeenCalledTimes(1);
    expect(h.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Oi, aqui é o Financeiro! Já te mando a segunda via.",
        agenteNome: "Financeiro",
      })
    );

    const segundo = mensagensDa(1);
    expect(segundo[0]!.content).toMatch(/Você é "Financeiro"/);
    expect(segundo[0]!.content).toMatch(/Nunca prometa desconto/);
    expect(segundo[0]!.content).not.toMatch(/"action":"transfer"/);
    expect(segundo.some((m) => m.content.includes("transferida para você por Ana"))).toBe(true);
  });

  it("nome de agente que não existe: escala para uma pessoa em vez de transferir", async () => {
    h.chatJson.mockResolvedValueOnce({ ok: true, data: { action: "transfer", agent: "Jurídico" } });
    turno();
    await runAgentTurn("cv_1");
    expect(h.transferirConversa).not.toHaveBeenCalled();
    expect(h.updates.some((u) => u.handoffReason === "modelo")).toBe(true);
    expect(h.sendText).not.toHaveBeenCalled();
  });

  it("sem agentes de área o prompt nem fala de transferência", async () => {
    h.listarAgentesArea.mockResolvedValue([]);
    h.chatJson.mockResolvedValueOnce({ ok: true, data: { action: "reply", text: "Oi" } });
    turno();
    await runAgentTurn("cv_1");
    expect(mensagensDa(0)[0]!.content).not.toMatch(/transfer/);
    // Sem agentes de área o balão continua só «IA».
    expect(h.sendText.mock.calls[0]![0]).not.toHaveProperty("agenteNome");
  });

  it("uma área desligada devolve a conversa ao principal", async () => {
    h.listarAgentesArea.mockResolvedValue([{ ...financeiro, ativo: false }]);
    h.chatJson.mockResolvedValueOnce({ ok: true, data: { action: "reply", text: "Oi" } });
    turno(conversacion({ agenteAreaId: "aga_fin" }));
    await runAgentTurn("cv_1");
    expect(mensagensDa(0)[0]!.content).toMatch(/Você é "Ana"/);
    // Com áreas cadastradas, o balão do principal leva o nome dele.
    expect(h.sendText).toHaveBeenCalledWith(expect.objectContaining({ agenteNome: "Ana" }));
  });
});

describe("regras dos agentes por área", () => {
  const principal = perfil as unknown as Parameters<typeof perfilDoTurno>[0];

  it("perfilDoTurno: nome e instruções da área por cima do principal", () => {
    const p = perfilDoTurno(principal, financeiro);
    expect(p.name).toBe("Financeiro");
    expect(p.tone).toBe("simpático");
    expect(p.instructions).toBe(
      "Somos a Piscinas Sol.\n\nInstruções específicas de Financeiro:\nNunca prometa desconto."
    );
    expect(perfilDoTurno(principal, null)).toBe(principal);
  });

  it("outrosAgentes: a área vê o principal; o principal vê as áreas ligadas", () => {
    const vendas = { ...financeiro, id: "aga_ven", nome: "Vendas", assunto: "orçamentos" };
    const desligado = { ...financeiro, id: "aga_off", nome: "RH", ativo: false };
    expect(outrosAgentes(null, "Ana", [financeiro, vendas, desligado]).map((d) => d.nome)).toEqual([
      "Financeiro",
      "Vendas",
    ]);
    expect(outrosAgentes("aga_fin", "Ana", [financeiro, vendas])).toEqual([
      { id: null, nome: "Ana", assunto: ASSUNTO_PRINCIPAL },
      { id: "aga_ven", nome: "Vendas", assunto: "orçamentos" },
    ]);
  });

  it("resolverDestino ignora maiúsculas e acentos, e não inventa", () => {
    const destinos = [{ id: "a", nome: "Finanças", assunto: "x" }];
    expect(resolverDestino("financas", destinos)?.id).toBe("a");
    expect(resolverDestino("  Finanças ", destinos)?.id).toBe("a");
    expect(resolverDestino("Vendas", destinos)).toBeNull();
  });

  it("a ação transfer exige o nome do agente", () => {
    const s = agentActionSchema(false);
    expect(s.safeParse({ action: "transfer", agent: "Financeiro" }).success).toBe(true);
    expect(s.safeParse({ action: "transfer" }).success).toBe(false);
  });

  it("o prompt lista os outros agentes com o assunto de cada um", () => {
    const p = buildAgentSystemPrompt({
      profile: principal,
      kb: [],
      stages: [{ name: "Novo" }],
      outrosAgentes: [{ nome: "Financeiro", assunto: "boletos e pagamentos" }],
    });
    expect(p).toMatch(/"action":"transfer"/);
    expect(p).toMatch(/· Financeiro: boletos e pagamentos/);
    expect(p).toMatch(/PESSOA\/humano → handoff, nunca transfer/);
  });

  it("o texto da transferência no hilo", () => {
    expect(
      textoTransferencia({ deNome: "Ana", paraNome: "Financeiro", origem: "ia", motivo: "boleto" })
    ).toBe("Ana passou a conversa para Financeiro: boleto");
    expect(
      textoTransferencia({ deNome: "Ana", paraNome: "Financeiro", origem: "equipe", motivo: null })
    ).toBe("Conversa passada de Ana para Financeiro pela equipe");
  });
});
