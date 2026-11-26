import { z } from "zod";

/**
 * Acción tipada del agente: exactamente UNA por turno (FR-021).
 * El servidor valida cada acción contra sus allowlists (etapas de la org);
 * lo que no valida se degrada, nunca se ejecuta a ciegas.
 */
/**
 * Ficha del lead: cualquier acción puede traer lo que el cliente dijo de sí
 * mismo en este turno («cidade», «servico», «orcamento»…). Va al lado de la
 * acción y no como acción propia porque el turno admite UNA: si guardar un
 * dato costara el turno, el modelo tendría que elegir entre anotar y contestar.
 *
 * Validación floja, igual que `PUT /api/bot/ficha`: lo que no sea un objeto se
 * descarta (`catch`) en vez de tumbar la acción, y `normalizeFicha` filtra el
 * resto al guardar. Un dato mal formado no puede costar la respuesta.
 */
const fichaField = {
  ficha: z.record(z.string(), z.unknown()).optional().catch(undefined),
};

const baseActions = [
  z.object({ action: z.literal("none"), ...fichaField }),
  z.object({ action: z.literal("reply"), text: z.string().min(1), ...fichaField }),
  z.object({
    action: z.literal("update_lead"),
    ...fichaField,
    note: z.string().min(1),
    reply: z.string().optional(),
  }),
  z.object({
    action: z.literal("move_stage"),
    ...fichaField,
    stage: z.string().min(1),
    reply: z.string().optional(),
  }),
  /**
   * Agentes por área — passar a conversa para outro agente. `agent` é o nome
   * exato de um dos agentes que o prompt listou; o servidor resolve contra os
   * reais e, se não achar, escala para uma pessoa.
   */
  z.object({
    action: z.literal("transfer"),
    ...fichaField,
    agent: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal("handoff"),
    ...fichaField,
    reason: z.string().optional(),
    farewell: z.string().optional(),
  }),
] as const;

/**
 * 015 — Las dos acciones de agenda. Solo se registran si esta instancia tiene
 * la bandera encendida: donde no hay agenda, el modelo ni siquiera puede
 * nombrarlas.
 *
 * `reply` es una introducción opcional, NO la lista de horarios: los horarios
 * los pega el motor con las etiquetas reales. Y `startUtc` tiene que ser
 * exactamente uno de los que el sistema ofreció — si no, el motor lo rechaza y
 * se re-ofrece.
 */
const agendaActions = [
  z.object({
    action: z.literal("offer_slots"),
    ...fichaField,
    reply: z.string().optional(),
  }),
  z.object({
    action: z.literal("book_slot"),
    ...fichaField,
    startUtc: z.string().min(1),
    reply: z.string().optional(),
  }),
] as const;

export const AgentAction = z.discriminatedUnion("action", [
  ...baseActions,
  ...agendaActions,
]);

/** El esquema que se le exige al modelo en ESTE turno. */
export function agentActionSchema(agenda: boolean) {
  return agenda
    ? AgentAction
    : z.discriminatedUnion("action", [...baseActions]);
}

export type AgentActionType = z.infer<typeof AgentAction>;

/**
 * Resuelve el nombre de etapa devuelto por el modelo contra las etapas reales
 * de la organización (exacto → lower-case). Sin match: degradar a reply/none.
 */
export function resolveStage(
  requested: string,
  stages: { id: string; name: string }[]
): { id: string; name: string } | null {
  const exact = stages.find((s) => s.name === requested.trim());
  if (exact) return exact;
  const lower = requested.trim().toLowerCase();
  return stages.find((s) => s.name.toLowerCase() === lower) ?? null;
}

/** Degrada una acción que no se pudo ejecutar (FR-021 / contrato ai.md). */
export function degradeAction(action: AgentActionType): AgentActionType {
  if (
    action.action === "move_stage" ||
    action.action === "offer_slots" ||
    action.action === "book_slot"
  ) {
    return action.reply
      ? { action: "reply", text: action.reply }
      : { action: "none" };
  }
  return action;
}
