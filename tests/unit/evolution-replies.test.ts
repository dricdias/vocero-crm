import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const m = vi.hoisted(() => ({ rows: [] as { id: string }[], where: vi.fn(), getDb: vi.fn() }));
vi.mock("@/lib/db", async (original) => ({ ...(await original<typeof import("@/lib/db")>()), getDb: m.getDb }));
import { confirmedGroupReply } from "@/server/evolution/replies";
beforeEach(() => {
  vi.clearAllMocks(); m.rows = [];
  const chain = { from: () => chain, innerJoin: () => chain, where: (query: SQL) => { m.where(query); return chain; }, limit: async () => m.rows };
  m.getDb.mockReturnValue({ select: () => chain });
});
describe("confirmación de respuestas directas en grupo", () => {
  it("exige salida IA real del mismo tenant, grupo y participante", async () => {
    m.rows = [{ id: "msg_out" }];
    expect(await confirmedGroupReply("org_1", "120363123@g.us", "15555550101:2@s.whatsapp.net", "OUT1")).toBe(true);
    const query = new PgDialect().sqlToQuery(m.where.mock.calls[0]![0]);
    expect(query.params).toEqual(["org_1", "org_1", "org_1", "evo:OUT1", "out", true, "whatsapp", false, "120363123@g.us", "evo-group:120363123@g.us:15555550101@s.whatsapp.net"]);
    for (const column of ["organization_id", "wa_message_id", "direction", "ai_generated", "channel", "is_test", "channel_thread_ref", "wa_identity"]) expect(query.sql).toContain(column);
  });
  it("sin coincidencia no autoriza, aunque el payload diga que citó al bot", async () => {
    expect(await confirmedGroupReply("org_1", "120363123@g.us", "15555550101@lid", "UNKNOWN")).toBe(false);
  });
  it("rechaza grupo, participante o referencia inválidos antes de consultar", async () => {
    expect(await confirmedGroupReply("org_1", "status@broadcast", "15555550101@lid", "OUT1")).toBe(false);
    expect(await confirmedGroupReply("org_1", "120363123@g.us", "invalid", "OUT1")).toBe(false);
    expect(await confirmedGroupReply("org_1", "120363123@g.us", "15555550101@lid", "")).toBe(false);
    expect(m.getDb).not.toHaveBeenCalled();
  });
});
