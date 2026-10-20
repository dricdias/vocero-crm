import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  status: vi.fn(),
  meta: vi.fn(),
  request: vi.fn(),
  probe: vi.fn(),
}));
vi.mock("@/server/evolution/credentials", () => ({
  getEvolutionByOrg: mocks.get,
  saveEvolution: mocks.save,
  deleteEvolution: mocks.remove,
  setEvolutionStatus: mocks.status,
}));
vi.mock("@/server/whatsapp/credentials", () => ({
  getCredentialsByOrg: mocks.meta,
}));
vi.mock("@/server/whatsapp/connection-lock", () => ({
  withWhatsappConnectionLock: async (
    _org: string,
    action: () => Promise<unknown>,
  ) => action(),
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ APP_BASE_URL: "https://crm.example" }),
}));
vi.mock("@/server/evolution/client", async (original) => ({
  ...(await original<typeof import("@/server/evolution/client")>()),
  evolutionRequest: mocks.request,
  getEvolutionStatus: mocks.probe,
}));
import { evolutionSettings } from "@/server/evolution/settings";
const session = { organizationId: "org_1", userId: "user_1", role: "owner" };
const req = (method: string, body?: unknown) =>
  new Request("https://crm.example/api/settings/evolution", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EVOLUTION_GO", "on");
  mocks.get.mockResolvedValue(null);
  mocks.meta.mockResolvedValue(null);
  mocks.probe.mockResolvedValue({ Connected: false, LoggedIn: false });
  mocks.request.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
describe("configuración Evolution Go", () => {
  it("apagado devuelve 404 sin consultar credenciales", async () => {
    vi.stubEnv("EVOLUTION_GO", "");
    expect((await evolutionSettings(session, req("GET"))).status).toBe(404);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("un miembro no puede leer ni modificar credenciales", async () => {
    for (const method of ["GET", "PUT", "POST", "DELETE"])
      expect(
        (await evolutionSettings({ ...session, role: "member" }, req(method)))
          .status,
      ).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("solo devuelve últimos cuatro, sin token ni cifrado", async () => {
    mocks.get.mockResolvedValue({
      baseUrl: "https://evo.example",
      status: "connected",
      token: "secret-1234",
      tokenCipher: "cipher",
    });
    const res = await evolutionSettings(session, req("GET"));
    expect(await res.json()).toEqual({
      connection: {
        baseUrl: "https://evo.example",
        status: "connected",
        tokenLast4: "1234",
      },
    });
  });
  it("rechaza coexistencia con Meta antes de contactar el gateway", async () => {
    mocks.meta.mockResolvedValue({ status: "connected" });
    expect(
      (
        await evolutionSettings(
          session,
          req("PUT", { baseUrl: "https://evo.example", token: "secret" }),
        )
      ).status,
    ).toBe(409);
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("guarda cifrado mediante repositorio antes de configurar webhook", async () => {
    const res = await evolutionSettings(
      session,
      req("PUT", { baseUrl: "https://evo.example/", token: "secret" }),
    );
    expect(res.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        baseUrl: "https://evo.example",
        webhookToken: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.request.mock.invocationCallOrder[0]!,
    );
    expect(mocks.request).toHaveBeenCalledWith(
      expect.anything(),
      "/instance/connect",
      expect.anything(),
      expect.objectContaining({
        subscribe: ["MESSAGE", "READ_RECEIPT", "CONNECTION", "QRCODE"],
        webhookUrl: expect.stringMatching(
          /^https:\/\/crm.example\/api\/webhooks\/evolution\/[a-f0-9]{64}$/,
        ),
      }),
    );
  });
  it("un fallo de registro no se presenta como conexión lista", async () => {
    mocks.request.mockRejectedValue(new Error("secret"));
    const res = await evolutionSettings(
      session,
      req("PUT", { baseUrl: "https://evo.example", token: "secret" }),
    );
    expect(res.status).toBe(502);
    expect(mocks.status).toHaveBeenCalledWith("org_1", false);
    expect(await res.text()).not.toContain('"secret"');
  });
  it("un QR que requiere passkey da una acción clara sin exponer su URL", async () => {
    mocks.get.mockResolvedValue({
      token: "secret",
      baseUrl: "https://evo.example",
    });
    mocks.request.mockResolvedValue({
      passkeyStage: "challenge",
      passkeyOpenUrl: "https://private.example/token",
    });
    const res = await evolutionSettings(session, req("POST", { action: "qr" }));
    expect(res.status).toBe(409);
    expect(await res.text()).not.toContain("private.example");
  });
  it("consultar estado exige conexión y login confirmados", async () => {
    mocks.get.mockResolvedValue({
      token: "secret",
      baseUrl: "https://evo.example",
    });
    mocks.probe.mockResolvedValue({ Connected: true, LoggedIn: false });
    const res = await evolutionSettings(
      session,
      req("POST", { action: "status" }),
    );
    expect(await res.json()).toMatchObject({ connected: false });
    expect(mocks.status).toHaveBeenCalledWith("org_1", false);
  });
  it("desvincular solo borra credenciales del tenant", async () => {
    expect((await evolutionSettings(session, req("DELETE"))).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith("org_1");
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
