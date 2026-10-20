import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  baseUrlSchema,
  evolutionRequest,
  sendEvolutionText,
  sendEvolutionMedia,
  statusSchema,
} from "@/server/evolution/client";
import { evolutionEnabled } from "@/server/evolution/flag";
import { incomingEvolution, sameToken } from "@/server/evolution/webhook";

const access = {
  baseUrl: "https://evolution.example",
  token: "secreto-de-instancia",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Evolution Go — contrato oficial", () => {
  it("está apagado por defecto", () => {
    vi.stubEnv("EVOLUTION_GO", "");
    expect(evolutionEnabled()).toBe(false);
    vi.stubEnv("EVOLUTION_GO", "on");
    expect(evolutionEnabled()).toBe(true);
  });
  it("rechaza credenciales y parámetros embebidos en URL", () => {
    expect(
      baseUrlSchema.safeParse("https://usuario:secreto@host.test").success,
    ).toBe(false);
    expect(
      baseUrlSchema.safeParse("https://host.test?token=secreto").success,
    ).toBe(false);
    expect(baseUrlSchema.parse("https://host.test/")).toBe("https://host.test");
  });
  it("usa apikey de instancia y campos Connected/LoggedIn", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          message: "success",
          data: { Connected: true, LoggedIn: true },
        }),
      );
    expect(
      await evolutionRequest(
        access,
        "/instance/status",
        statusSchema,
        undefined,
        fetchImpl,
      ),
    ).toEqual({ Connected: true, LoggedIn: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://evolution.example/instance/status",
      expect.objectContaining({
        headers: expect.objectContaining({ apikey: access.token }),
        redirect: "error",
      }),
    );
  });
  it("no filtra secretos cuando el proveedor falla", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(access.token, { status: 401 }));
    await expect(
      evolutionRequest(
        access,
        "/instance/status",
        statusSchema,
        undefined,
        fetchImpl,
      ),
    ).rejects.toThrow("rejeitou o token");
    await expect(
      evolutionRequest(
        access,
        "/instance/status",
        statusSchema,
        undefined,
        vi.fn().mockRejectedValue(new Error(access.token)),
      ),
    ).rejects.not.toThrow(access.token);
  });
  it("rechaza una respuesta 200 fuera del contrato", async () => {
    await expect(
      evolutionRequest(
        access,
        "/instance/status",
        statusSchema,
        undefined,
        vi.fn().mockResolvedValue(Response.json({ connected: true })),
      ),
    ).rejects.toMatchObject({ status: 502 });
    await expect(
      evolutionRequest(
        access,
        "/test",
        z.object({}),
        undefined,
        vi
          .fn()
          .mockResolvedValue(Response.json({ message: "error", data: {} })),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });
  it("envía texto y lee data.Info.ID (sin rutas Evolution API v2)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: "success", data: { Info: { ID: "MSG1" } } }),
      );
    vi.stubGlobal("fetch", fetchImpl);
    expect(await sendEvolutionText(access, "5511999999999", "Hola")).toBe(
      "evo:MSG1",
    );
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual({
      number: "5511999999999",
      text: "Hola",
    });
    expect(fetchImpl.mock.calls[0]![0]).toBe(`${access.baseUrl}/send/text`);
  });
  it("envía archivos privados por multipart", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: "success", data: { Info: { ID: "FILE1" } } }),
      );
    vi.stubGlobal("fetch", fetchImpl);
    await sendEvolutionMedia(access, "5511999999999", "image", {
      data: Buffer.from("foto"),
      mimeType: "image/png",
      fileName: "foto.png",
    });
    const form = fetchImpl.mock.calls[0]![1].body as FormData;
    expect(form.get("type")).toBe("image");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });
  it("compara el token del webhook sin aceptar prefijos", () => {
    expect(sameToken("abc", "abc")).toBe(true);
    expect(sameToken("ab", "abc")).toBe(false);
    expect(sameToken("abd", "abc")).toBe(false);
  });
});
const message = {
  Info: {
    ID: "IN1",
    Chat: "5511999999999@s.whatsapp.net",
    IsFromMe: false,
    IsGroup: false,
    Timestamp: "2026-10-20T03:00:00Z",
    PushName: "Ana",
  },
  Message: { conversation: "Oi" },
};
describe("Evolution Go — entrada de mensajes", () => {
  it("normaliza el evento actual con Info/Message", () => {
    expect(incomingEvolution(message)).toMatchObject({
      waMessageId: "evo:IN1",
      text: "Oi",
      identity: { phone: "5511999999999", profileName: "Ana" },
    });
  });
  it("conserva LID sin inventar tel?fono", () => {
    expect(
      incomingEvolution({
        ...message,
        Info: { ...message.Info, Chat: "123456@lid" },
      }),
    ).toMatchObject({ identity: { identity: "evo-lid:123456", phone: null } });
  });
  it("no dispara IA en ecos ni grupos", () => {
    expect(
      incomingEvolution({
        ...message,
        Info: { ...message.Info, IsFromMe: true },
      }),
    ).toBeNull();
    expect(
      incomingEvolution({
        ...message,
        Info: { ...message.Info, IsGroup: true },
      }),
    ).toBeNull();
  });
  it("preserva el protocolo del adjunto para descarga privada", () => {
    expect(
      incomingEvolution({
        ...message,
        Message: { imageMessage: { mimetype: "image/png", caption: "Foto" } },
      }),
    ).toMatchObject({
      type: "image",
      text: "Foto",
      media: {
        fetchStatus: "pending",
        payload: {
          evolutionMessage: { imageMessage: { mimetype: "image/png" } },
        },
      },
    });
  });
  it("rechaza eventos obsoletos y fechas inválidas", () => {
    expect(
      incomingEvolution({
        key: { id: "old" },
        message: { conversation: "Hola" },
      }),
    ).toBeNull();
    expect(
      incomingEvolution({
        ...message,
        Info: { ...message.Info, Timestamp: "incorrecta" },
      }),
    ).toBeNull();
  });
});
