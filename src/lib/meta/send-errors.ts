/**
 * Traduce el error de envío de Meta a algo que el operador pueda ACCIONAR.
 *
 * Meta manda el motivo en inglés y en jerga propia ("User's number is part of
 * an experiment"), y el CRM lo guardaba sin mostrarlo: el mensaje fallido solo
 * enseñaba un triángulo mudo. Aquí se convierte en una frase que dice qué
 * pasó y qué hacer, conservando el código para poder rastrearlo en la
 * documentación de Meta.
 */

const DESCRIPTIONS: Record<number, string> = {
  130472:
    "A Meta colocou o número do destinatário em um experimento e está bloqueando as mensagens de MARKETING. Não é falha da sua configuração: tente com um template da categoria UTILITY ou com outro número.",
  131049:
    "A Meta limitou as mensagens de marketing para este usuário para preservar a qualidade do ecossistema. Aguarde ou use um template da categoria UTILITY.",
  131047:
    "Passaram mais de 24 h desde a última mensagem do cliente: só é possível reabrir com um template aprovado.",
  131048:
    "A Meta bloqueou o envio por limite de spam no seu número. Diminua o ritmo de envios e verifique a qualidade do número.",
  131026:
    "O destinatário não pode receber mensagens de WhatsApp (número inexistente, sem conta ou que não aceita mensagens de empresas).",
  131031:
    "Sua conta do WhatsApp Business está bloqueada ou restrita pela Meta. Verifique no Gerenciador do WhatsApp.",
  131030:
    "O número do destinatário não está na lista de permitidos do seu app em modo de teste.",
  130429:
    "Você ultrapassou o limite de mensagens por segundo da Meta. Tente de novo em instantes.",
  132000:
    "O template e os parâmetros enviados não batem (faltam ou sobram variáveis).",
  132001:
    "A Meta não encontra esse template nesse idioma. Sincronize os templates e confirme que ele continua aprovado.",
  132005:
    "O texto traduzido do template ultrapassa o limite de caracteres da Meta.",
  132007:
    "O conteúdo do template viola as políticas da Meta.",
  132012:
    "Os parâmetros do template não seguem o formato que a Meta espera.",
  132015:
    "O template está pausado por baixa qualidade: a Meta não deixa enviar até ele se recuperar.",
  132016:
    "O template foi desativado por qualidade e não pode mais ser enviado.",
  133010: "O número não está registrado na Cloud API.",
  368: "O número está temporariamente bloqueado por violar as políticas da Meta.",
};

/**
 * @param code   Código numérico de Meta (`errors[0].code`), si vino.
 * @param detail Texto crudo de Meta, como respaldo cuando el código es nuevo.
 */
export function describeSendError(
  code: number | null | undefined,
  detail?: string | null
): string {
  const known = code != null ? DESCRIPTIONS[code] : undefined;
  // `||` y no `??`: Meta a veces manda el texto vacío o en blanco, y un
  // mensaje de error vacío es tan inútil como el triángulo mudo.
  const base = known || detail?.trim() || "A Meta rejeitou o envio";
  return code != null ? `${base} (Meta ${code})` : base;
}
