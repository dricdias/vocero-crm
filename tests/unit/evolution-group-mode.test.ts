import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const m = vi.hoisted(() => ({ rows: [] as { mode: string }[], where: vi.fn(), values: vi.fn(), upsert: vi.fn(), getDb: vi.fn() }));
vi.mock("@/lib/db", async (original) => ({ ...(await original<typeof import("@/lib/db")>()), getDb: m.getDb }));
import { getEvolutionGroupMode, setEvolutionGroupMode } from "@/server/evolution/group-mode";
beforeEach(() => {
  vi.clearAllMocks(); m.rows = [];
  const chain = { from: () => chain, where: (query: SQL) => { m.where(query); return chain; }, limit: async () => m.rows };
  m.getDb.mockReturnValue({ select: () => chain, insert: () => ({ values: (values: unknown) => { m.values(values); return { onConflictDoUpdate: m.upsert }; } }) });
});
describe("modo de grupo persistido", () => {
  it("preserva menções quando não há preferência e isola organização/grupo", async () => {
    expect(await getEvolutionGroupMode("org_a", "120363123@g.us")).toBe("mentions");
    const query = new PgDialect().sqlToQuery(m.where.mock.calls[0]![0]);
    expect(query.params).toEqual(["org_a", "120363123@g.us"]);
    expect(query.sql).toContain("organization_id"); expect(query.sql).toContain("group_jid");
  });
  it("retorna o modo salvo e trata valor desconhecido como menções", async () => {
    m.rows = [{ mode: "all" }]; expect(await getEvolutionGroupMode("org_a", "120363123@g.us")).toBe("all");
    m.rows = [{ mode: "unknown" }]; expect(await getEvolutionGroupMode("org_a", "120363123@g.us")).toBe("mentions");
  });
  it("salva com chave única organização/grupo, sem alterar credenciais", async () => {
    await setEvolutionGroupMode("org_a", "120363123@g.us", "all");
    expect(m.values).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org_a", groupJid: "120363123@g.us", replyMode: "all" }));
    expect(m.upsert.mock.calls[0]![0].target.map((column: { name: string }) => column.name)).toEqual(["organization_id", "group_jid"]);
  });
  it("rejeita identificadores inválidos antes de gravar", async () => {
    await expect(setEvolutionGroupMode("org_a", "status@broadcast", "all")).rejects.toThrow();
    expect(m.values).not.toHaveBeenCalled();
  });
});

const h = vi.hoisted(() => ({ conversation: vi.fn(), credentials: vi.fn(), read: vi.fn(), write: vi.fn(), publish: vi.fn() }));
vi.mock("@/server/inbox/queries", () => ({ getConversation: h.conversation }));
vi.mock("@/server/evolution/credentials", () => ({ getEvolutionByOrg: h.credentials }));
vi.mock("@/server/events/bus", () => ({ publish: h.publish }));
// El handler se prueba con el repositorio real simulado arriba: no abre BD.
import { evolutionGroupModeSettings } from "@/server/evolution/group-mode-settings";
const session = { organizationId: "org_a", userId: "user_a", role: "owner" };
const request = (method: string, body?: unknown) => new Request("https://crm.test/api/conversations/cv_a/group-mode", { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeEach(() => {
  vi.stubEnv("EVOLUTION_GO", "on"); vi.stubEnv("EVOLUTION_GO_GROUP_BOT_NUMBER", "15555550100");
  h.credentials.mockResolvedValue({ status: "connected", token: "not-returned" });
  h.conversation.mockResolvedValue({ conversation: { organizationId: "org_a", channel: "whatsapp", isTest: false }, contact: { organizationId: "org_a", waIdentity: "evo-group:120363123@g.us:15555550101@s.whatsapp.net" } });
});
afterEach(() => vi.unstubAllEnvs());
describe("configuração do modo pela conversa", () => {
  it("desligado responde 404 sem consultar dados", async () => {
    vi.stubEnv("EVOLUTION_GO", ""); expect((await evolutionGroupModeSettings(session, request("GET"), "cv_a")).status).toBe(404);
    expect(h.conversation).not.toHaveBeenCalled();
  });
  it("membro pode ler, mas não alterar", async () => {
    const member = { ...session, role: "member" };
    const response = await evolutionGroupModeSettings(member, request("GET"), "cv_a");
    expect(await response.json()).toEqual({ mode: "mentions", available: true, canConfigure: false });
    expect((await evolutionGroupModeSettings(member, request("PATCH", { mode: "all" }), "cv_a")).status).toBe(403);
    expect(m.values).not.toHaveBeenCalled();
  });
  it("administra só o grupo da conversa e publica a atualização", async () => {
    const response = await evolutionGroupModeSettings(session, request("PATCH", { mode: "all" }), "cv_a");
    expect(response.status).toBe(200);
    expect(h.conversation).toHaveBeenCalledWith("org_a", "cv_a");
    expect(m.values).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org_a", groupJid: "120363123@g.us", replyMode: "all" }));
    expect(h.publish).toHaveBeenCalledWith("org_a", expect.objectContaining({ type: "conversation.updated" }));
    expect(await response.text()).not.toContain("not-returned");
  });
  it("não aceita modo inválido nem grupos desativados", async () => {
    expect((await evolutionGroupModeSettings(session, request("PATCH", { mode: "invalid" }), "cv_a")).status).toBe(422);
    vi.stubEnv("EVOLUTION_GO_GROUP_BOT_NUMBER", "");
    expect((await evolutionGroupModeSettings(session, request("PATCH", { mode: "all" }), "cv_a")).status).toBe(409);
    expect(m.values).not.toHaveBeenCalled();
  });
  it("não aceita conversa privada, sandbox nem organização alheia", async () => {
    for (const row of [
      { conversation: { organizationId: "org_a", channel: "whatsapp", isTest: false }, contact: { organizationId: "org_a", waIdentity: "15555550101" } },
      { conversation: { organizationId: "org_a", channel: "whatsapp", isTest: true }, contact: { organizationId: "org_a", waIdentity: "evo-group:120363123@g.us:15555550101@lid" } },
      { conversation: { organizationId: "org_other", channel: "whatsapp", isTest: false }, contact: { organizationId: "org_other", waIdentity: "evo-group:120363123@g.us:15555550101@lid" } },
    ]) {
      h.conversation.mockResolvedValueOnce(row);
      expect((await evolutionGroupModeSettings(session, request("PATCH", { mode: "all" }), "cv_a")).status).toBe(404);
    }
    expect(m.values).not.toHaveBeenCalled();
  });
});
