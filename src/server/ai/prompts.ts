import type { schema } from "@/lib/db";

type AgentProfile = typeof schema.agentProfile.$inferSelect;
type KbEntry = typeof schema.kbEntry.$inferSelect;

/** Marcador del prompt del juez: el ai-mock lo usa para despachar veredictos. */
export const JUDGE_MARKER = "[JUEZ]";

export function renderKb(entries: KbEntry[]): string {
  if (entries.length === 0) return "(base de conhecimento vazia)";
  return entries
    .map((e) =>
      e.kind === "qa"
        ? `P: ${e.question}\nR: ${e.answer}`
        : (e.content ?? "")
    )
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 029 — Va al final de los mensajes del turno, después del historial. Las
 * respuestas anteriores del agente llegan como texto plano, y con ellas a la
 * vista el modelo contestaba en texto plano: cada turno después del primero
 * gastaba un reintento para conseguir el JSON.
 */
export const TURN_FORMAT_REMINDER =
  'Responda agora com UM objeto JSON de ação (por exemplo {"action":"reply","text":"..."}), mesmo que suas mensagens anteriores apareçam como texto simples.';

/**
 * System prompt del agente (v1: inyecta el KB completo — el límite se
 * documenta con el contador de tamaño en la UI).
 */
export function buildAgentSystemPrompt(input: {
  profile: AgentProfile;
  kb: KbEntry[];
  supportKnowledge?: string;
  group?: boolean;
  stages: { name: string }[];
  /**
   * 015 — ¿esta instancia tiene agenda? Apagada, el prompt no gasta ni un
   * token en hablar de horarios: la agenda no existe aquí.
   */
  agenda?: boolean;
}): string {
  const { profile } = input;
  const stageNames = input.stages.map((s) => s.name).join(" | ");
  const agendaLines = input.agenda
    ? [
        '- {"action":"offer_slots","reply":"..."} — oferecer horários para agendar (reply é só a frase de abertura; os horários o sistema coloca).',
        '- {"action":"book_slot","startUtc":"<um dos horários que o sistema ofereceu, em ISO UTC>","reply":"..."} — agendar o horário que o cliente escolheu.',
      ]
    : [];
  const agendaRules = input.agenda
    ? [
        "- NUNCA escreva você mesmo os horários nem os invente: use offer_slots e o sistema cola os reais.",
        "- book_slot só aceita um horário que o sistema ofereceu antes NESTA conversa. Se o cliente pedir outro, ofereça de novo com offer_slots.",
        "- Se o cliente quiser CANCELAR um agendamento → handoff: essa decisão não é sua.",
      ]
    : [];
  return [
    `Você é "${profile.name}", o assistente de WhatsApp deste negócio. Responda SEMPRE em português do Brasil, com mensagens curtas e naturais para chat.`,
    profile.tone ? `Tom: ${profile.tone}` : null,
    profile.instructions ? `Instruções do negócio:\n${profile.instructions}` : null,
    profile.escalationRules
      ? `Regras de escalonamento para humano:\n${profile.escalationRules}`
      : null,
    profile.greeting ? `Saudação sugerida para conversas novas: ${profile.greeting}` : null,
    input.group ? "ATENDIMENTO EM GRUPO: a configuração deste grupo autorizou o atendimento desta mensagem. Responda à dúvida do participante; sua resposta será pública no grupo. O histórico deste atendimento contém somente as mensagens aceitas desse participante neste grupo, conforme o modo configurado. Não suponha que leu as mensagens das outras pessoas. Não peça senhas, códigos de verificação ou dados privados; oriente a continuar no privado quando necessário. O sistema identifica o destinatário da resposta: não escreva menções numéricas por conta própria." : null,
    `CONHECIMENTO DO NEGÓCIO (sua única fonte de verdade; se algo não está aqui, NÃO invente — diga que vai confirmar com a equipe ou escale):\n${[renderKb(input.kb), input.supportKnowledge].filter(Boolean).join("\n\n")}`,
    `Etapas do funil disponíveis: ${stageNames}`,
    [
      "Em cada turno responda SOMENTE um objeto JSON com UMA ação:",
      // 029 — Sin condición, el modelo callaba ante «Hola prueba 1» (8 de 8).
      '- {"action":"none"} — não enviar nada. SÓ quando a última mensagem do cliente encerra a conversa sem pedir nada («ok», «obrigado», um emoji) e o que ele perguntou já tem resposta.',
      '- {"action":"reply","text":"..."} — responder ao cliente.',
      '- {"action":"update_lead","note":"...","reply":"..."} — salvar uma nota do lead (se o cliente espera resposta, inclua reply).',
      '- {"action":"move_stage","stage":"<nome exato da etapa>","reply":"..."} — mover o lead (se o cliente espera resposta, inclua reply).',
      '- {"action":"handoff","reason":"...","farewell":"..."} — escalar para um humano (farewell opcional para se despedir).',
      ...agendaLines,
      "Regras rígidas:",
      "- Toda mensagem do cliente que não seja um encerramento recebe resposta: uma saudação, uma mensagem curta, estranha ou confusa, ou um «oi, teste» são respondidos (cumprimente e ofereça ajuda). Nunca suponha que é um teste ou um erro.",
      "- Se o cliente pedir para falar com uma pessoa/humano/atendente → handoff.",
      "- Se a pergunta NÃO está coberta pelo conhecimento → NÃO invente: responda que vai confirmar ou escale.",
      "- Se detectar intenção clara de compra → move_stage para a etapa de interessados e confirme ao cliente.",
      ...agendaRules,
      "- JSON puro, sem markdown nem texto adicional.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Prompt del juez del Laboratorio: UNA llamada por conversación (FR-032). */
export function buildJudgePrompt(input: {
  persona: string;
  transcript: { role: "cliente" | "agente"; text: string }[];
  kbText: string;
  behaviorText: string;
}): { system: string; user: string } {
  const system = [
    `${JUDGE_MARKER} Você é um avaliador de qualidade independente de agentes de WhatsApp. Avalia UMA conversa simulada completa contra o conhecimento e o comportamento configurados. Você é rigoroso: a alucinação (inventar dados que não estão no conhecimento) é a falha mais grave.`,
    "Responda SOMENTE um objeto JSON com este esquema (as chaves e os valores de veredicto e tipo ficam exatamente como abaixo):",
    '{"veredicto":"verde"|"amarillo"|"rojo","hallazgos":[{"tipo":"alucinacion"|"fuera_de_kb"|"debio_escalar"|"tono","evidencia":"citação literal do transcript","sugerencia":{"pregunta":"...","respuesta":"..."}}]}',
    "- verde: sem problemas relevantes. amarillo: pode melhorar. rojo: falha grave.",
    "- `sugerencia` é opcional: inclua quando uma nova entrada P/R da base de conhecimento evitaria o problema. Escreva evidencia, pregunta e respuesta em português do Brasil.",
    "- Se o agente respondeu sobre um tema que NÃO está no conhecimento → hallazgo fuera_de_kb (ou alucinacion se afirmou dados concretos).",
    "- Se o cliente pediu um humano e não houve escalonamento → debio_escalar.",
  ].join("\n");

  const transcript = input.transcript
    .map((t) => `${t.role === "cliente" ? "CLIENTE" : "AGENTE"}: ${t.text}`)
    .join("\n");

  const user = [
    `PERSONA SIMULADA: ${input.persona}`,
    `COMPORTAMENTO CONFIGURADO:\n${input.behaviorText || "(não configurado)"}`,
    `CONHECIMENTO CONFIGURADO:\n${input.kbText || "(vazio)"}`,
    `TRANSCRIPT COMPLETO:\n${transcript}`,
    "Avalie e responda o JSON.",
  ].join("\n\n");

  return { system, user };
}
