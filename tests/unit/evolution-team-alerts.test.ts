import { afterEach, describe, expect, it, vi } from "vitest";
import {
  conversationLink,
  excerpt,
  handoffAlertText,
  isTeamGroupIdentity,
  listTeamGroups,
  reminderText,
  sendTeamGroupText,
} from "@/server/evolution/team-alerts";

const access = { baseUrl: "https://evo.example.com", token: "tok" };
const contact = { name: "Maria Souza", phone: "+1 555 0100" };

afterEach(() => vi.unstubAllGlobals());

describe("textos dos avisos da equipe", () => {
  it("aviso de atendimento humano traz cliente, motivo, trecho e link", () => {
    const text = handoffAlertText({
      contact,
      reason: "cliente",
      lastMessage: "quero falar com um atendente",
      link: conversationLink("https://crm.example.com/", "cv_1"),
    });
    expect(text).toContain("*Atendimento humano*");
    expect(text).toContain("Cliente: Maria Souza (+1 555 0100)");
    expect(text).toContain("Motivo: O cliente pediu um humano");
    expect(text).toContain('"quero falar com um atendente"');
    expect(text).toContain("https://crm.example.com/inbox?conversation=cv_1");
  });

  it("motivo desconhecido e cliente sem telefone não quebram o texto", () => {
    const text = handoffAlertText({
      contact: { name: "", phone: null },
      reason: null,
      lastMessage: null,
      link: "https://crm/x",
    });
    expect(text).toContain("Cliente: Cliente sem nome");
    expect(text).toContain("Motivo: A IA pausou");
    expect(text).not.toContain("Última mensagem");
  });

  it("lembrete diz há quantos minutos o cliente espera", () => {
    const text = reminderText({ contact, minutes: 17, lastMessage: "alô?", link: "https://crm/x" });
    expect(text.split("\n")[0]).toBe("⏰ *Sem resposta há 17 min*");
    expect(text).toContain('"alô?"');
  });

  it("trecho junta espaços e corta mensagens longas", () => {
    expect(excerpt("  oi\n\n tudo   bem ")).toBe("oi tudo bem");
    const long = excerpt("a".repeat(500))!;
    expect(long.length).toBe(160);
    expect(long.endsWith("…")).toBe(true);
    expect(excerpt("   ")).toBeNull();
  });

  it("conversas abertas dentro do próprio grupo da equipe não geram aviso", () => {
    const g = "120363000000000001@g.us";
    expect(isTeamGroupIdentity(`evo-group:${g}:5511999999999@s.whatsapp.net`, g)).toBe(true);
    expect(isTeamGroupIdentity("5511999999999", g)).toBe(false);
    expect(isTeamGroupIdentity("evo-group:999@g.us:1@lid", g)).toBe(false);
  });
});

describe("Evolution Go: grupos e envio", () => {
  it("envia para o grupo com formatJid false", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ message: "success", data: { Info: { ID: "M1" } } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await sendTeamGroupText(access, "120363000000000001@g.us", "oi");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://evo.example.com/send/text");
    expect(JSON.parse(String(init.body))).toEqual({
      number: "120363000000000001@g.us",
      text: "oi",
      formatJid: false,
    });
  });

  it("recusa destino que não é grupo", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendTeamGroupText(access, "5511999999999@s.whatsapp.net", "oi")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lista só grupos válidos, com nome, em ordem alfabética", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          message: "success",
          data: [
            { JID: "2@g.us", Name: "Vendas" },
            { JID: "1@g.us", Name: "  " },
            { JID: "5511999999999@s.whatsapp.net", Name: "não é grupo" },
            { JID: "3@g.us", Name: "Equipe" },
          ],
        }),
      ),
    );
    expect(await listTeamGroups(access)).toEqual([
      { jid: "1@g.us", name: "1@g.us" },
      { jid: "3@g.us", name: "Equipe" },
      { jid: "2@g.us", name: "Vendas" },
    ]);
  });

  it("número sem grupos devolve lista vazia", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "success", data: null })));
    expect(await listTeamGroups(access)).toEqual([]);
  });
});
