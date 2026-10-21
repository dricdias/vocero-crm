import { afterEach, describe, expect, it, vi } from "vitest";
import { incomingEvolution, processEvolutionEvent } from "@/server/evolution/webhook";
import { evolutionGroupTarget, groupBotJid } from "@/server/evolution/groups";
import { sendEvolutionText } from "@/server/evolution/client";

vi.mock("@/server/inbox/ingest", () => ({ ingestInboundMessage: vi.fn() }));
vi.mock("@/server/evolution/credentials", () => ({ setEvolutionStatus: vi.fn() }));
import { ingestInboundMessage } from "@/server/inbox/ingest";
import type { EvolutionCredentials } from "@/server/evolution/credentials";

const bot = "15555550100@s.whatsapp.net";
const group = "120363000123@g.us";
const sender = "5511999999999@s.whatsapp.net";
const event = {
  Info: { ID: "GROUP1", Chat: group, Sender: sender, IsGroup: true, IsFromMe: false, Timestamp: 1792530000, PushName: "Ana" },
  Message: { extendedTextMessage: { text: "@15555550100 como recuperar a senha?", contextInfo: { mentionedJID: [bot] } } },
};
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Evolution Go: grupos por menção", () => {
  it("exige conector ativo e número válido para optar por grupos", () => {
    vi.stubEnv("EVOLUTION_GO", "");
    vi.stubEnv("EVOLUTION_GO_GROUP_BOT_NUMBER", "15555550100");
    expect(groupBotJid()).toBeNull();
    vi.stubEnv("EVOLUTION_GO", "on");
    expect(groupBotJid()).toBe(bot);
    vi.stubEnv("EVOLUTION_GO_GROUP_BOT_NUMBER", "REEMPLAZA_NUMERO_CONECTADO");
    expect(groupBotJid()).toBeNull();
  });
  it("aceita apenas menção explícita ao bot e mantém o grupo como destino", () => {
    const incoming = incomingEvolution(event, [bot]);
    expect(incoming).toMatchObject({ identity: { phone: null, profileName: "Ana (grupo)", identity: `evo-group:${group}:${sender}` }, threadRef: group });
    expect(evolutionGroupTarget(incoming!.identity.identity)).toEqual({ group, participant: sender });
  });
  it("ignora grupos sem configuração, menção alheia, texto @ sem metadados e ecos", () => {
    expect(incomingEvolution(event)).toBeNull();
    expect(incomingEvolution(event, ["15555550101@s.whatsapp.net"])).toBeNull();
    expect(incomingEvolution({ ...event, Message: { conversation: "@15555550100 oi" } }, [bot])).toBeNull();
    expect(incomingEvolution({ ...event, Info: { ...event.Info, IsFromMe: true } }, [bot])).toBeNull();
  });
  it("isola participantes e grupos, nunca reconcilia com o telefone privado", () => {
    const a = incomingEvolution(event, [bot])!;
    const b = incomingEvolution({ ...event, Info: { ...event.Info, Sender: "5522999999999@lid" } }, [bot])!;
    const c = incomingEvolution({ ...event, Info: { ...event.Info, Chat: "120363000456@g.us" } }, [bot])!;
    expect(new Set([a.identity.identity, b.identity.identity, c.identity.identity]).size).toBe(3);
    expect(a.identity.phone).toBeNull();
    expect(incomingEvolution({ ...event, Info: { ...event.Info, Sender: undefined } }, [bot])).toBeNull();
    expect(evolutionGroupTarget(`evo-group:${group}:invalid`)).toBeNull();
  });
  it("não aceita menção dentro de mensagem citada como convocação", () => {
    expect(incomingEvolution({ ...event, Message: { extendedTextMessage: { text: "oi", contextInfo: { quotedMessage: event.Message } } } }, [bot])).toBeNull();
  });
  it("normaliza o identificador de dispositivo do bot", () => {
    expect(incomingEvolution(event, ["15555550100:2@s.whatsapp.net"])).not.toBeNull();
  });
  it("aceita menção na legenda de imagem e mantém o anexo", () => {
    const incoming = incomingEvolution({ ...event, Message: { imageMessage: { caption: "senha?", contextInfo: { mentionedJID: [bot] } } } }, [bot]);
    expect(incoming).toMatchObject({ type: "image", text: "senha?", threadRef: group, media: { kind: "image" } });
  });
  it("envia ao grupo e menciona só o participante atendido", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message: "success", data: { Info: { ID: "OUT1" } } }));
    vi.stubGlobal("fetch", fetcher);
    await sendEvolutionText({ baseUrl: "https://evo.test", token: "secret" }, group, "@5511999999999 Veja o guia.", sender);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ number: group, text: "@5511999999999 Veja o guia.", formatJid: false, mentionedJid: [sender] });
  });
  it("resolve a menção LID pelo número configurado antes de ingerir", async () => {
    vi.stubEnv("EVOLUTION_GO", "on");
    vi.stubEnv("EVOLUTION_GO_GROUP_BOT_NUMBER", "15555550100");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message: "success", data: { Users: { [bot]: { LID: "998877@lid" } } } }));
    vi.stubGlobal("fetch", fetcher);
    const creds = { organizationId: "org_group", baseUrl: "https://evo.test", token: "secret-lid" } as EvolutionCredentials;
    await processEvolutionEvent(creds, { event: "Message", instanceToken: creds.token, data: { ...event, Message: { extendedTextMessage: { text: "senha?", contextInfo: { mentionedJID: ["998877@lid"] } } } } });
    expect(ingestInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org_group", threadRef: group }));
    expect(fetcher.mock.calls[0]![0]).toBe("https://evo.test/user/info");
  });
  it("falha fechada se a identidade LID não pode ser confirmada", async () => {
    vi.stubEnv("EVOLUTION_GO", "on");
    vi.stubEnv("EVOLUTION_GO_GROUP_BOT_NUMBER", "15555550100");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const creds = { organizationId: "org_unavailable", baseUrl: "https://evo.test", token: "secret-offline" } as EvolutionCredentials;
    await processEvolutionEvent(creds, { event: "Message", instanceToken: creds.token, data: { ...event, Message: { extendedTextMessage: { text: "senha?", contextInfo: { mentionedJID: ["776655@lid"] } } } } });
    expect(ingestInboundMessage).not.toHaveBeenCalled();
  });
  it("ignora eventos sem menção antes de consultar o gateway", async () => {
    vi.stubEnv("EVOLUTION_GO", "on");
    vi.stubEnv("EVOLUTION_GO_GROUP_BOT_NUMBER", "15555550100");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await processEvolutionEvent({ organizationId: "org_ignore" } as EvolutionCredentials, { event: "Message", instanceToken: "secret", data: { ...event, Message: { conversation: "oi" } } });
    expect(fetcher).not.toHaveBeenCalled();
    expect(ingestInboundMessage).not.toHaveBeenCalled();
  });
  it("não confia em LID de outro número retornado pelo gateway", async () => {
    vi.stubEnv("EVOLUTION_GO", "on");
    vi.stubEnv("EVOLUTION_GO_GROUP_BOT_NUMBER", "15555550100");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "success", data: { Users: { "15555550101@s.whatsapp.net": { LID: "123456@lid" } } } })));
    await processEvolutionEvent({ organizationId: "org_other_lid", baseUrl: "https://evo.test", token: "other-lid" } as EvolutionCredentials, { event: "Message", instanceToken: "other-lid", data: { ...event, Message: { extendedTextMessage: { text: "oi", contextInfo: { mentionedJID: ["123456@lid"] } } } } });
    expect(ingestInboundMessage).not.toHaveBeenCalled();
  });
});
