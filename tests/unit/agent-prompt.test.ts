import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt, TURN_FORMAT_REMINDER } from "@/server/ai/prompts";
import { aiMockCompletion } from "@/server/dev/ai-mock";
import { agentActionSchema } from "@/server/ai/actions";

/**
 * 029 — El agente no se queda callado ante un saludo. Lo que el modelo hace
 * con el prompt se mide contra el modelo real en `scripts/eval-silencios.mjs`;
 * aquí se fija que el prompt diga lo que esa medición necesita.
 */

type Profile = Parameters<typeof buildAgentSystemPrompt>[0]["profile"];
const profile = {
  name: "Sofía",
  tone: null,
  instructions: null,
  escalationRules: null,
  greeting: null,
} as unknown as Profile;

const prompt = (agenda: boolean) =>
  buildAgentSystemPrompt({ profile, kb: [], stages: [{ name: "Nuevo" }], agenda });

describe.each([false, true])("prompt del agente (agenda %s)", (agenda) => {
  const p = prompt(agenda);
  const linea = (accion: string) =>
    p.split("\n").find((l) => l.startsWith(`- {"action":"${accion}"`)) ?? "";

  it("callar solo cuando el cliente cierra", () => {
    expect(linea("none")).toMatch(/SÓ quando a última mensagem do cliente encerra/);
    expect(linea("none")).not.toBe('- {"action":"none"} — não responder nada.');
  });

  it("un saludo, un mensaje raro o una prueba se contestan", () => {
    expect(p).toMatch(/Toda mensagem do cliente que não seja um encerramento recebe resposta/);
    expect(p).toMatch(/Nunca suponha que é um teste/);
  });

  it("responde en portugués de Brasil", () => {
    expect(p).toMatch(/SEMPRE em português do Brasil/);
  });

  it("la nota y el cambio de etapa no sustituyen la respuesta", () => {
    expect(linea("update_lead")).toMatch(/se o cliente espera resposta, inclua reply/);
    expect(linea("move_stage")).toMatch(/se o cliente espera resposta, inclua reply/);
  });
});

describe("recordatorio de formato al final del turno", () => {
  it("pide el JSON de una acción", () => {
    expect(TURN_FORMAT_REMINDER).toMatch(/UM objeto JSON de ação/);
  });

  it("el ai-mock sigue contestando con él al final", () => {
    const raw = aiMockCompletion([
      { role: "system", content: prompt(false) },
      { role: "user", content: "Hola prueba 1" },
      { role: "system", content: TURN_FORMAT_REMINDER },
    ]);
    expect(agentActionSchema(false).safeParse(JSON.parse(raw)).success).toBe(true);
  });
});
