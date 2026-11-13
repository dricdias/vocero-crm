/**
 * 054 — Los eventos que se pintan en el hilo (cambios de etapa y el traspaso a
 * una persona): el DTO y su texto. Puro, para probarlo sin servidor.
 */
import { LOSS_REASON_LABEL, type LossReason, type StageChangeSource } from "./types";

export type EventoHiloDto = {
  id: string;
  tipo: "etapa" | "traspaso";
  texto: string;
  createdAt: string;
};

/**
 * Por qué la IA dejó de contestar, con las palabras del panel del contacto.
 * `hostilidad` faltaba allá: se agrega aquí y el panel lo usa.
 */
export const HANDOFF_LABELS: Record<string, string> = {
  cliente: "O cliente pediu um humano",
  modelo: "O agente decidiu escalar",
  error: "Erro do provedor de IA",
  ventana: "Janela de 24h fechada",
  hostilidad: "O cliente ficou agressivo e o agente se retirou",
  manual_reply: "Você respondeu pelo celular — IA em pausa",
};

/** D1 — «Pasó a Interesado · por Ana», «Entró al embudo en Nuevo»… */
export function textoEventoEtapa(e: {
  fromStageName: string | null;
  toStageName: string;
  lossReason: LossReason | string | null;
  source: StageChangeSource | string;
  actorNombre: string | null;
}): string {
  const base = e.fromStageName === null ? `Entrou no funil em ${e.toStageName}` : `Passou para ${e.toStageName}`;
  const motivo =
    e.lossReason && e.lossReason in LOSS_REASON_LABEL
      ? ` · ${LOSS_REASON_LABEL[e.lossReason as LossReason]}`
      : "";
  const quien = e.actorNombre
    ? ` · por ${e.actorNombre}`
    : e.source === "bot"
      ? " · pelo agente"
      : "";
  return `${base}${motivo}${quien}`;
}

/** D1 — «La IA se pausó: el cliente pidió un humano». */
export function textoTraspaso(motivo: string | null): string {
  const etiqueta = motivo ? HANDOFF_LABELS[motivo] : undefined;
  if (!etiqueta) return "A IA pausou";
  return `A IA pausou: ${etiqueta.charAt(0).toLowerCase()}${etiqueta.slice(1)}`;
}
