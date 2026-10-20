import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  row: null as unknown,
  evo: vi.fn(),
  send: vi.fn(),
  graph: vi.fn(),
  insert: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/lib/db", async (original) => ({
  ...(await original<typeof import("@/lib/db")>()),
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: async () => (m.row ? [m.row] : []) }),
        }),
      }),
    }),
    insert: () => ({
      values: (value: unknown) => ({
        returning: async () => {
          m.insert(value);
          return [{ id: "msg_1", ...(value as object) }];
        },
      }),
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  }),
}));
vi.mock("@/server/evolution/credentials", () => ({
  getEvolutionByOrg: m.evo,
  setEvolutionStatus: m.status,
}));
vi.mock("@/server/evolution/client", async (original) => ({
  ...(await original<typeof import("@/server/evolution/client")>()),
  sendEvolutionText: m.send,
}));
vi.mock("@/lib/meta/client", async (original) => ({
  ...(await original<typeof import("@/lib/meta/client")>()),
  graphRequest: m.graph,
}));
vi.mock("@/server/inbox/ingest", () => ({
  serializeMessage: (value: unknown) => value,
}));
vi.mock("@/server/events/bus", () => ({ publish: vi.fn() }));
import { sendText } from "@/server/inbox/send";
import { EvolutionError } from "@/server/evolution/client";
const input = {
  conversationId: "cv_1",
  organizationId: "org_1",
  text: "Hola",
  aiGenerated: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.row = {
    conversation: {
      id: "cv_1",
      organizationId: "org_1",
      channel: "whatsapp",
      isTest: false,
      lastInboundAt: new Date(),
    },
    contact: { phone: "5511999999999", waIdentity: "5511999999999" },
  };
  m.evo.mockResolvedValue({
    organizationId: "org_1",
    baseUrl: "https://evo.example",
    token: "secret",
    status: "connected",
  });
  m.send.mockResolvedValue("evo:OUT1");
});
describe("envío por Evolution en la puerta real del CRM", () => {
  it("envía respuesta IA por Evolution y persiste su ID, nunca llama a Meta", async () => {
    expect(await sendText(input)).toEqual({
      messageId: expect.stringMatching(/^msg_/),
    });
    expect(m.send).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_1" }),
      "5511999999999",
      "Hola",
    );
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        waMessageId: "evo:OUT1",
        aiGenerated: true,
      }),
    );
    expect(m.graph).not.toHaveBeenCalled();
  });
  it("Laboratorio falla antes de consultar o llamar al proveedor", async () => {
    (m.row as { conversation: { isTest: boolean } }).conversation.isTest = true;
    await expect(sendText(input)).rejects.toMatchObject({
      code: "sandbox_violation",
    });
    expect(m.evo).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });
  it("no consulta credenciales de otro tenant", async () => {
    await expect(
      sendText({ ...input, organizationId: "org_otro" }),
    ).rejects.toThrow();
    expect(m.evo).not.toHaveBeenCalled();
  });
  it("conserva la guarda de ventana", async () => {
    (
      m.row as { conversation: { lastInboundAt: Date } }
    ).conversation.lastInboundAt = new Date(0);
    await expect(sendText(input)).rejects.toMatchObject({
      code: "window_closed",
    });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("responde al JID LID sin exigir teléfono", async () => {
    (m.row as { contact: unknown }).contact = {
      phone: null,
      waIdentity: "evo-lid:123456",
    };
    await sendText(input);
    expect(m.send).toHaveBeenCalledWith(
      expect.anything(),
      "123456@lid",
      "Hola",
    );
  });
  it("credencial rechazada pausa Evolution sin fallback a Meta", async () => {
    m.send.mockRejectedValue(new EvolutionError(401));
    await expect(sendText(input)).rejects.toMatchObject({
      code: "reconnect_required",
    });
    expect(m.status).toHaveBeenCalledWith("org_1", false);
    expect(m.graph).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
});
