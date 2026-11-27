import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Número próprio por agente (Evolution Go): cada agente de área pode ter a
 * sua instância. Quem escreve nesse número cai com o agente dele, e a
 * resposta sai pelo número em que o cliente escreveu.
 */

const h = vi.hoisted(() => ({
  ingest: vi.fn(),
  status: vi.fn(),
  principal: vi.fn(),
  doAgente: vi.fn(),
  save: vi.fn(),
  tokenEmUso: vi.fn(),
  probe: vi.fn(),
  request: vi.fn(),
  areas: vi.fn(),
  transferir: vi.fn(),
  principalNome: [] as unknown[],
}));

vi.mock("@/server/inbox/ingest", () => ({ ingestInboundMessage: h.ingest }));
vi.mock("@/server/evolution/credentials", () => ({
  setEvolutionStatus: h.status,
  getEvolutionByOrg: h.principal,
  getEvolutionDoAgente: h.doAgente,
  saveEvolution: h.save,
  deleteEvolution: vi.fn(),
  tokenEmUso: h.tokenEmUso,
}));
vi.mock("@/server/whatsapp/credentials", () => ({ getCredentialsByOrg: async () => null }));
vi.mock("@/server/whatsapp/connection-lock", () => ({
  withWhatsappConnectionLock: async (_org: string, action: () => Promise<unknown>) => action(),
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    APP_BASE_URL: "https://crm.example",
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  }),
}));
vi.mock("@/server/evolution/client", async (original) => ({
  ...(await original<typeof import("@/server/evolution/client")>()),
  evolutionRequest: h.request,
  getEvolutionStatus: h.probe,
}));
vi.mock("@/server/events/bus", () => ({ publish: vi.fn() }));

import { processEvolutionEvent } from "@/server/evolution/webhook";
import { evolutionSettingsDoNumero } from "@/server/evolution/settings";
import type { EvolutionCredentials } from "@/server/evolution/credentials";
import { textoTransferencia } from "@/lib/eventos-hilo";

const linhaFinanceiro = {
  id: "evo_fin",
  organizationId: "org_1",
  agenteAreaId: "aga_fin",
} as EvolutionCredentials;

const mensagem = (extra: Record<string, unknown> = {}) => ({
  event: "Message",
  instanceToken: "token",
  data: {
    Info: {
      ID: "IN1",
      Chat: "5511999999999@s.whatsapp.net",
      IsFromMe: false,
      IsGroup: false,
      Timestamp: "2026-11-26T15:00:00Z",
      ...extra,
    },
    Message: { conversation: "quero a segunda via" },
  },
});

describe("webhook de um número de agente", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a mensagem entra dizendo por qual número chegou", async () => {
    await processEvolutionEvent(linhaFinanceiro, mensagem());
    expect(h.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        evolutionLinha: { id: "evo_fin", agenteAreaId: "aga_fin" },
      })
    );
  });

  it("o número de um agente não atende grupos", async () => {
    await processEvolutionEvent(
      linhaFinanceiro,
      mensagem({ Chat: "120363000000000000@g.us", IsGroup: true, Sender: "5511888@s.whatsapp.net" })
    );
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it("conectar ou cair muda só o estado daquele número", async () => {
    await processEvolutionEvent(linhaFinanceiro, { event: "Disconnected", instanceToken: "t", data: {} });
    expect(h.status).toHaveBeenCalledWith("org_1", false, { linhaId: "evo_fin" });
  });
});

describe("configurar o número próprio de um agente", () => {
  const session = { organizationId: "org_1", userId: "u_1", role: "owner" };
  const put = () =>
    new Request("https://crm.example/api/agentes/aga_fin/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: "https://evo.example", token: "tok-fin" }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("EVOLUTION_GO", "on");
    h.principal.mockResolvedValue({ id: "evo_principal" });
    h.tokenEmUso.mockResolvedValue(false);
    h.probe.mockResolvedValue({ Connected: false, LoggedIn: false });
    h.request.mockResolvedValue({});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("salva a instância como número do agente", async () => {
    const res = await evolutionSettingsDoNumero(session, put(), "aga_fin");
    expect(res.status).toBe(200);
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_1", agenteAreaId: "aga_fin", token: "tok-fin" })
    );
  });

  it("sem número principal, pede para conectar ele primeiro", async () => {
    h.principal.mockResolvedValue(null);
    const res = await evolutionSettingsDoNumero(session, put(), "aga_fin");
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("principal_required");
    expect(h.save).not.toHaveBeenCalled();
  });

  it("a mesma instância não pode ser dois números", async () => {
    h.tokenEmUso.mockResolvedValue(true);
    const res = await evolutionSettingsDoNumero(session, put(), "aga_fin");
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("token_in_use");
    expect(h.tokenEmUso).toHaveBeenCalledWith("org_1", "tok-fin", "aga_fin");
    expect(h.save).not.toHaveBeenCalled();
  });

  it("ler e consultar usam o número do agente, não o principal", async () => {
    h.doAgente.mockResolvedValue({ baseUrl: "https://evo.example", status: "connected", token: "tok-fin" });
    const res = await evolutionSettingsDoNumero(
      session,
      new Request("https://crm.example/api/agentes/aga_fin/whatsapp"),
      "aga_fin"
    );
    expect(await res.json()).toEqual({
      connection: { baseUrl: "https://evo.example", status: "connected", tokenLast4: "-fin" },
    });
    expect(h.doAgente).toHaveBeenCalledWith("org_1", "aga_fin");
  });
});

describe("o texto no hilo", () => {
  it("quando o cliente escreve no número do agente", () => {
    expect(
      textoTransferencia({ deNome: "Ana", paraNome: "Financeiro", origem: "numero", motivo: null })
    ).toBe("O cliente escreveu no número de Financeiro, que assumiu a conversa");
  });
});
