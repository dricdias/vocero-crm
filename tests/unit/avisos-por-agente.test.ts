import { afterEach, describe, expect, it, vi } from "vitest";
import {
  destinoDoAviso,
  handoffAlertText,
  reminderText,
  sendTeamText,
} from "@/server/evolution/team-alerts";
import { agenteAreaSchema } from "@/app/api/agentes/schema";

/**
 * Agentes por área — o aviso de «atendimento humano» de uma conversa vai para
 * o grupo ou a pessoa do agente que a atendia; sem destino próprio, para o
 * grupo geral da equipe.
 */

const GERAL = "120363000000000001@g.us";
const access = { baseUrl: "https://evo.example.com", token: "tok" };

afterEach(() => vi.unstubAllGlobals());

describe("para onde vai o aviso", () => {
  it("conversa do principal: grupo geral, sem linha de agente", () => {
    expect(destinoDoAviso(GERAL, null)).toEqual({ destino: GERAL, agente: null });
  });

  it("agente com grupo próprio: o grupo dele", () => {
    expect(
      destinoDoAviso(GERAL, { nome: "Financeiro", ativo: true, avisoDestino: "120363000000000002@g.us" })
    ).toEqual({ destino: "120363000000000002@g.us", agente: "Financeiro" });
  });

  it("agente com uma pessoa: o telefone dela", () => {
    expect(
      destinoDoAviso(GERAL, { nome: "Financeiro", ativo: true, avisoDestino: "5511999990000" })
    ).toEqual({ destino: "5511999990000", agente: "Financeiro" });
  });

  it("agente sem destino: grupo geral, dizendo qual agente era", () => {
    expect(destinoDoAviso(GERAL, { nome: "Vendas", ativo: true, avisoDestino: null })).toEqual({
      destino: GERAL,
      agente: "Vendas",
    });
  });

  it("agente desligado ou destino estranho: grupo geral", () => {
    expect(
      destinoDoAviso(GERAL, { nome: "Financeiro", ativo: false, avisoDestino: "5511999990000" }).destino
    ).toBe(GERAL);
    expect(
      destinoDoAviso(GERAL, { nome: "Financeiro", ativo: true, avisoDestino: "x@s.whatsapp.net" }).destino
    ).toBe(GERAL);
  });
});

describe("textos com o agente", () => {
  const base = { contact: { name: "Ana", phone: null }, lastMessage: null, link: "https://crm/x" };

  it("o aviso e o lembrete dizem qual agente atendia", () => {
    expect(handoffAlertText({ ...base, reason: "modelo", agente: "Financeiro" })).toContain(
      "Agente: Financeiro"
    );
    expect(reminderText({ ...base, minutes: 15, agente: "Financeiro" })).toContain("Agente: Financeiro");
  });

  it("sem agente de área, o texto fica como antes", () => {
    expect(handoffAlertText({ ...base, reason: "modelo" })).not.toContain("Agente:");
  });
});

describe("envio para uma pessoa", () => {
  it("telefone vai como número comum (sem formatJid)", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ message: "success", data: { Info: { ID: "M1" } } })
    );
    vi.stubGlobal("fetch", fetchMock);
    await sendTeamText(access, "5511999990000", "oi");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ number: "5511999990000", text: "oi" });
  });

  it("grupo continua com formatJid false", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ message: "success", data: { Info: { ID: "M1" } } })
    );
    vi.stubGlobal("fetch", fetchMock);
    await sendTeamText(access, GERAL, "oi");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ number: GERAL, formatJid: false });
  });

  it("recusa destino inválido sem chamar o Evolution", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendTeamText(access, "abc", "oi")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("o que a tela pode salvar", () => {
  const ok = (avisoDestino: string | null) =>
    agenteAreaSchema.safeParse({ nome: "Financeiro", assunto: "boletos", avisoDestino }).success;

  it("aceita grupo, telefone com DDI ou nada", () => {
    expect(ok(GERAL)).toBe(true);
    expect(ok("5511999990000")).toBe(true);
    expect(ok(null)).toBe(true);
  });

  it("recusa telefone curto e JID de pessoa", () => {
    expect(ok("12345")).toBe(false);
    expect(ok("5511999990000@s.whatsapp.net")).toBe(false);
  });
});
