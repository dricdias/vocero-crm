import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSupportReader,
  type SupportConfig,
  type SupportArticle,
  type SupportKnowledge,
} from "@/server/agi-support/reader";
import {
  renderAgiSupport,
  selectSupportArticles,
} from "@/server/agi-support/context";
const article = (
  id: string,
  title: string,
  content: string,
  keywords: string[] = [],
): SupportArticle => ({
  id,
  title,
  content,
  topic: "conta",
  keywords,
  url: `https://agiteam.app/negocio/suporte/guia/${id}`,
});
const articles = [
  article(
    "senha",
    "Como recuperar a senha",
    "Use Esqueci minha senha na tela Entrar.",
    ["login", "senha"],
  ),
  article(
    "google",
    "Conectar o Google",
    "Abra Conexoes e conecte seu perfil do Google.",
    ["google"],
  ),
  article("conheca-time", "O que o Agi faz?", "O Agi ajuda seu negocio.", [
    "agentes",
  ]),
];
const snapshot = { version: 1, revision: "a".repeat(64), articles };
const config: SupportConfig = {
  enabled: true,
  url: "https://agiteam.app/api/integracoes/crm/conhecimento",
  token: "token-exclusivo-de-leitura-com-32-caracteres",
  production: true,
};
const success = () => Response.json(snapshot);
afterEach(() => vi.restoreAllMocks());
describe("leitura editorial opcional", () => {
  it("apagada ou sem configuração não usa a rede", async () => {
    const fetchImpl = vi.fn();
    expect(
      (
        await createSupportReader({
          config: () => ({ ...config, enabled: false }),
          fetchImpl,
        })()
      ).status,
    ).toBe("disabled");
    expect(
      (
        await createSupportReader({
          config: () => ({ ...config, token: "" }),
          fetchImpl,
        })()
      ).status,
    ).toBe("unconfigured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("não envia perguntas nem segue redirects com o token", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => success());
    const value = await createSupportReader({
      config: () => config,
      fetchImpl,
    })();
    expect(value.status).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledWith(
      config.url,
      expect.objectContaining({
        redirect: "error",
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/json",
        },
      }),
    );
    expect(JSON.stringify(value)).not.toContain(config.token);
  });
  it("recusa HTTP em produção e URLs com credenciais", async () => {
    for (const url of [
      "http://agiteam.app/export",
      "https://secret@agiteam.app/export",
      "https://agiteam.app/export?token=secret",
    ]) {
      const fetchImpl = vi.fn();
      expect(
        (
          await createSupportReader({
            config: () => ({ ...config, url }),
            fetchImpl,
          })()
        ).status,
      ).toBe("unconfigured");
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });
  it("usa cache por cinco minutos e atualiza depois", async () => {
    let now = 1_000;
    const fetchImpl = vi.fn().mockImplementation(async () => success());
    const read = createSupportReader({
      config: () => config,
      fetchImpl,
      now: () => now,
    });
    await read();
    now += 299_000;
    await read();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 2_000;
    await read();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("deduplica consultas simultâneas", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => success());
    const read = createSupportReader({ config: () => config, fetchImpl });
    const values = await Promise.all([read(), read(), read()]);
    expect(values.every((v) => v.status === "ready")).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("conserva cópia válida na queda e deixa de usá-la após uma hora", async () => {
    let now = 1000;
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => success())
      .mockRejectedValue(new Error(config.token));
    const read = createSupportReader({
      config: () => config,
      fetchImpl,
      now: () => now,
    });
    await read();
    now += 301_000;
    expect((await read()).status).toBe("cached");
    now += 1000;
    expect((await read()).articles).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    now += 3_600_000;
    const result = await read();
    expect(result).toMatchObject({ status: "unavailable", articles: [] });
    expect(JSON.stringify(result)).not.toContain(config.token);
  });
  it("rejeita payload incompatível, IDs repetidos e links adulterados", async () => {
    for (const data of [
      { ...snapshot, version: 2 },
      { ...snapshot, articles: [articles[0], articles[0]] },
      {
        ...snapshot,
        articles: [{ ...articles[0], url: "https://malicious.example" }],
      },
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue(Response.json(data));
      expect(
        (await createSupportReader({ config: () => config, fetchImpl })())
          .status,
      ).toBe("unavailable");
    }
  });
  it("limita bytes declarados e recebidos", async () => {
    for (const response of [
      new Response("{}", { headers: { "content-length": "300000" } }),
      new Response("x".repeat(256001)),
    ]) {
      expect(
        (
          await createSupportReader({
            config: () => config,
            fetchImpl: vi.fn().mockResolvedValue(response),
          })()
        ).status,
      ).toBe("unavailable");
    }
  });
  it("não usa cache de outra configuração", async () => {
    let current = config;
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => success())
      .mockRejectedValue(new Error("offline"));
    const read = createSupportReader({ config: () => current, fetchImpl });
    await read();
    current = { ...config, token: "outro-token-exclusivo-com-32-caracteres" };
    expect((await read()).articles).toHaveLength(0);
  });
  it("falha síncrona também pode ser tentada novamente", async () => {
    let now = 1000;
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("offline");
      })
      .mockImplementation(async () => success());
    const read = createSupportReader({
      config: () => config,
      fetchImpl,
      now: () => now,
    });
    expect((await read()).status).toBe("unavailable");
    now += 31_000;
    expect((await read()).status).toBe("ready");
  });
});
describe("referência do turno", () => {
  const knowledge: SupportKnowledge = {
    status: "ready",
    articles,
    revision: snapshot.revision,
    syncedAt: new Date(0).toISOString(),
  };
  it("seleciona a dúvida e usa a pergunta anterior para continuação", () => {
    expect(selectSupportArticles(articles, "esqueci minha senha")[0]?.id).toBe(
      "senha",
    );
    expect(
      selectSupportArticles(articles, "onde?", "conectar Google")[0]?.id,
    ).toBe("google");
  });
  it("saudação recebe apresentação, sem inventar um procedimento", () => {
    expect(selectSupportArticles(articles, "oi").map((a) => a.id)).toEqual([
      "conheca-time",
    ]);
  });
  it("desligada não muda o prompt; indisponível orienta confirmação", () => {
    expect(renderAgiSupport({ ...knowledge, status: "disabled" })).toBe("");
    expect(
      renderAgiSupport({ ...knowledge, status: "unconfigured", articles: [] }),
    ).toBe("");
    expect(
      renderAgiSupport({ ...knowledge, status: "unavailable", articles: [] }),
    ).toContain("encaminhe para uma pessoa");
  });
  it("preserva links dos guias e limita o contexto do turno", () => {
    const huge = Array.from({ length: 10 }, (_, i) =>
      article(`guia-${i}`, `Senha ${i}`, "senha ".repeat(1500)),
    );
    const result = renderAgiSupport({ ...knowledge, articles: huge }, "senha");
    expect(result.length).toBeLessThan(18_500);
    expect(result).toContain("https://agiteam.app/negocio/suporte/guia/");
    expect(
      renderAgiSupport({
        ...knowledge,
        articles: [article("senha", "Senha", "Veja [outro](guia:google)")],
      }),
    ).not.toContain("(guia:");
  });
  it("perfil e juiz podem receber o snapshot completo", () => {
    const result = renderAgiSupport(knowledge);
    expect(result).toContain("Como recuperar a senha");
    expect(result).toContain("Conectar o Google");
  });
});
