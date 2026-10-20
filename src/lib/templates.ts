/**
 * Variables posicionales {{n}} del cuerpo de una plantilla de WhatsApp.
 * Puro y sin dependencias: lo usan tanto el servicio de servidor como la UI
 * (que necesita saber cuántos campos pintar antes de enviar).
 */

const VARIABLE_REGEX = /\{\{\s*(\d+)\s*\}\}/g;

/** Máximo de parámetros posicionales por cuerpo que acepta Meta. */
export const MAX_TEMPLATE_VARIABLES = 10;

/** Índices distintos de {{n}} presentes en el cuerpo, ordenados. */
function variableIndexes(body: string): number[] {
  const found = new Set<number>();
  for (const m of body.matchAll(VARIABLE_REGEX)) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

/**
 * Cuántos parámetros exige el cuerpo = el índice más alto. Con la numeración
 * validada (1..N sin saltos) equivale al número de variables distintas.
 */
export function countVariables(body: string): number {
  const indexes = variableIndexes(body);
  return indexes.length ? indexes[indexes.length - 1]! : 0;
}

/**
 * Meta acepta varias variables por cuerpo, pero exige numeración posicional
 * contigua desde {{1}}: un salto ({{1}} y {{3}}) es rechazo seguro.
 */
export function validateBodyVariables(body: string): string | null {
  const indexes = variableIndexes(body);
  if (indexes.length === 0) return null;
  if (indexes.length > MAX_TEMPLATE_VARIABLES) {
    return `O corpo aceita até ${MAX_TEMPLATE_VARIABLES} variáveis`;
  }
  for (let i = 0; i < indexes.length; i++) {
    if (indexes[i] !== i + 1) {
      return `As variáveis devem ser numeradas {{1}}, {{2}}, … sem pular (falta {{${i + 1}}})`;
    }
  }
  return null;
}

/**
 * Lo que suele hacer que Meta rechace una plantilla aunque las variables
 * estén bien numeradas. No bloquea el envío —Meta decide—, solo avisa antes
 * de esperar horas por un rechazo previsible.
 */
export function templateWarnings(body: string): string[] {
  const text = body.trim();
  if (!text) return [];
  const warnings: string[] = [];
  if (/^\{\{\s*\d+\s*\}\}/.test(text)) {
    warnings.push("Começa com uma variável: a Meta costuma rejeitar. Coloque uma saudação antes, ex.: «Olá {{1}}».");
  }
  if (/\{\{\s*\d+\s*\}\}[\s.!?¡¿]*$/.test(text)) {
    warnings.push("Termina com uma variável: a Meta costuma rejeitar. Adicione uma frase depois.");
  }
  if (/\}\}\s*\{\{/.test(text)) {
    warnings.push("Há duas variáveis juntas: separe-as com texto.");
  }
  const variables = countVariables(text);
  const words = text.replace(VARIABLE_REGEX, " ").split(/\s+/).filter(Boolean).length;
  if (variables > 0 && words < variables * 3) {
    warnings.push("Tem variáveis demais para uma mensagem tão curta: a Meta pede mais texto fixo ao redor.");
  }
  return warnings;
}

/** Sustituye {{n}} por `variables[n-1]` (vacío si no hay valor). */
export function renderBody(body: string, variables: string[] = []): string {
  return body.replace(VARIABLE_REGEX, (_match, index: string) => {
    return variables[Number(index) - 1] ?? "";
  });
}
