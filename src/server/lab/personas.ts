/**
 * Las 6 personas GUIONADAS del Laboratorio (FR-030). El cliente simulado no
 * usa LLM: son secuencias fijas — determinismo total del lado del cliente.
 * El agente que responde es el REAL (mismo pipeline de US3).
 */

export type Persona = {
  key: string;
  label: string;
  description: string;
  /** Teléfono sintético estable (jamás un número real). */
  phone: string;
  contactName: string;
  script: string[];
};

export const PERSONAS: Persona[] = [
  {
    key: "comprador_decidido",
    label: "Comprador decidido",
    description: "Sabe o que quer e vai direto para a compra.",
    phone: "5210000000001",
    contactName: "[Teste] Comprador decidido",
    script: [
      "Olá, boa tarde",
      "Vocês têm furadeiras sem fio disponíveis?",
      "Perfeito, quanto custa a mais vendida?",
      "Gostei, vou comprar. Como eu pago?",
    ],
  },
  {
    key: "pregunton_precios",
    label: "Pesquisador de preços",
    description: "Pergunta preço atrás de preço sem se decidir.",
    phone: "5210000000002",
    contactName: "[Teste] Pesquisador de preços",
    script: [
      "Oi, qual o preço do martelo?",
      "E da chave Phillips?",
      "Quanto custa a caixa de pregos de 2 polegadas?",
      "Tem desconto se eu levar várias coisas?",
      "Ok, vou pensar",
    ],
  },
  {
    key: "cliente_enojado",
    label: "Cliente irritado",
    description: "Chega bravo por causa de um problema com a compra.",
    phone: "5210000000003",
    contactName: "[Teste] Cliente irritado",
    script: [
      "Olha, isso é um absurdo",
      "Comprei uma lixadeira semana passada e ela já não liga, é uma porcaria",
      "Vocês vão me responder ou não? Quero uma solução AGORA",
      "Espero mesmo, porque não vou perder meu dinheiro",
    ],
  },
  {
    key: "fuera_de_kb",
    label: "Pergunta fora do conhecimento",
    description: "Pergunta algo que a base de conhecimento não cobre (fuera_de_kb).",
    phone: "5210000000004",
    contactName: "[Teste] Fora do conhecimento",
    script: [
      "Oi, uma pergunta",
      "Qual é a política de garantia e devolução de vocês?",
      "E se o produto der defeito depois de dois meses, vocês trocam?",
      "Onde eu aciono a garantia?",
    ],
  },
  {
    key: "pide_humano",
    label: "Pede um humano",
    description: "Quer ser atendido por uma pessoa (deve escalar).",
    phone: "5210000000005",
    contactName: "[Teste] Pede humano",
    script: [
      "Oi",
      "Tenho um assunto delicado sobre um pedido",
      "Prefiro ser atendido por uma pessoa, quero falar com um humano",
      "Obrigado",
    ],
  },
  {
    key: "errores_modismos",
    label: "Erros e gírias",
    description: "Escreve com erros de ortografia e gírias brasileiras.",
    phone: "5210000000006",
    contactName: "[Teste] Erros e gírias",
    script: [
      "eae, vcs vendem tinta?",
      "e ai sabe se tem tiner?",
      "qnt q ta o galao d tinta branca pra parede d dentro",
      "blz, ja ja passo ai na loja, falou",
    ],
  },
];

export const PERSONA_LABELS: Record<string, string> = Object.fromEntries(
  PERSONAS.map((p) => [p.key, p.label])
);
