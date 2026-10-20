import { it, expect, vi } from "vitest";
const ingest = vi.hoisted(() => vi.fn());
vi.mock("@/server/inbox/ingest", () => ({ ingestInboundMessage: ingest }));
vi.mock("@/server/evolution/credentials", () => ({
  setEvolutionStatus: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }),
}));
import { processEvolutionEvent } from "@/server/evolution/webhook";
import { decryptSecret } from "@/lib/crypto";
import type { EvolutionCredentials } from "@/server/evolution/credentials";
it("cifra las claves de descarga antes de persistir el adjunto", async () => {
  const proto = {
    imageMessage: {
      mimetype: "image/png",
      mediaKey: "clave-privada-de-descarga",
    },
  };
  await processEvolutionEvent(
    { organizationId: "org_1" } as EvolutionCredentials,
    {
      event: "Message",
      instanceToken: "token",
      data: {
        Info: {
          ID: "IN1",
          Chat: "5511999999999@s.whatsapp.net",
          IsFromMe: false,
          IsGroup: false,
          Timestamp: "2026-10-20T03:00:00Z",
        },
        Message: proto,
      },
    },
  );
  expect(ingest).toHaveBeenCalledOnce();
  const payload = ingest.mock.calls[0]![0].media.payload;
  expect(JSON.stringify(payload)).not.toContain("clave-privada-de-descarga");
  expect(
    JSON.parse(
      decryptSecret({
        cipher: payload.evolutionCipher,
        iv: payload.evolutionIv,
        tag: payload.evolutionTag,
      }),
    ),
  ).toEqual(proto);
});
