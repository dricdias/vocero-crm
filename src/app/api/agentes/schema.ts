import { z } from "zod";

/** Um grupo de WhatsApp (`123-456@g.us`) ou um telefone em dígitos, com DDI. */
export const AVISO_DESTINO_RE = /^(?:\d+(?:-\d+)?@g\.us|\d{10,15})$/;

/** Agentes por área — o que a tela Agente manda ao criar ou editar uma área. */
export const agenteAreaSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome ao agente").max(60, "Nome longo demais (máx. 60)"),
  assunto: z
    .string()
    .trim()
    .min(3, "Diga o que este agente atende")
    .max(300, "Assunto longo demais (máx. 300)"),
  tom: z.string().trim().max(500).nullable().optional(),
  instrucoes: z.string().trim().max(8000).nullable().optional(),
  regrasEscalonamento: z.string().trim().max(4000).nullable().optional(),
  ativo: z.boolean().optional(),
  /** Grupo (JID) ou telefone de quem recebe os avisos deste agente; null = o grupo geral. */
  avisoDestino: z
    .string()
    .trim()
    .regex(AVISO_DESTINO_RE, "Escolha um grupo ou digite o telefone com DDI e DDD")
    .nullable()
    .optional(),
  avisoNome: z.string().trim().max(200).nullable().optional(),
});

export const agenteAreaPatchSchema = agenteAreaSchema.partial();

/** O que a API devolve de cada agente de área. */
export function agenteAreaDto(a: {
  id: string;
  nome: string;
  assunto: string;
  tom: string | null;
  instrucoes: string | null;
  regrasEscalonamento: string | null;
  ativo: boolean;
  avisoDestino?: string | null;
  avisoNome?: string | null;
}) {
  return {
    id: a.id,
    nome: a.nome,
    assunto: a.assunto,
    tom: a.tom,
    instrucoes: a.instrucoes,
    regrasEscalonamento: a.regrasEscalonamento,
    ativo: a.ativo,
    avisoDestino: a.avisoDestino ?? null,
    avisoNome: a.avisoNome ?? null,
  };
}

/** Postgres 23505 no índice único (org, nome). */
export function nomeRepetido(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
