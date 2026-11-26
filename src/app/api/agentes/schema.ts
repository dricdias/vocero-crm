import { z } from "zod";

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
}) {
  return {
    id: a.id,
    nome: a.nome,
    assunto: a.assunto,
    tom: a.tom,
    instrucoes: a.instrucoes,
    regrasEscalonamento: a.regrasEscalonamento,
    ativo: a.ativo,
  };
}

/** Postgres 23505 no índice único (org, nome). */
export function nomeRepetido(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
