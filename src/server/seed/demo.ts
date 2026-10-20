import { eq, inArray } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/**
 * Negocio de demostración "Ferretería El Martillo" (FR-075).
 * Idempotente: borra los datos demo previos de la organización (scoped por
 * los teléfonos demo) y reinserta. El KB queda lleno EXCEPTO garantías y
 * devoluciones — hueco INTENCIONAL para que el Laboratorio encuentre algo
 * real en la primera corrida.
 */

type Db = ReturnType<typeof getDb>;

const HOURS = 60 * 60 * 1000;

const DEMO_CONTACTS: {
  phone: string;
  name: string;
  notes?: string;
  stage: string;
  thread: { dir: "in" | "out"; text: string; hoursAgo: number; ai?: boolean }[];
}[] = [
  {
    phone: "5215612340001",
    name: "Maria Fernanda Lopes",
    stage: "Interessado",
    notes: "Está reformando a cozinha; procura ferramenta elétrica.",
    thread: [
      { dir: "in", text: "Oi, vocês têm furadeira sem fio?", hoursAgo: 5 },
      { dir: "out", text: "Oi, Maria! Temos sim: a Black+Decker 20V por US$ 99 e a DeWalt 20V MAX por US$ 179, as duas com bateria inclusa.", hoursAgo: 5, ai: true },
      { dir: "in", text: "A Black+Decker vem com brocas?", hoursAgo: 4 },
      { dir: "out", text: "Vem com um jogo básico de 5 brocas para concreto e madeira. Se precisar de mais, o jogo de 30 peças sai por US$ 19.", hoursAgo: 4, ai: true },
      { dir: "in", text: "Perfeito, quero a Black+Decker. Vocês separam pra mim?", hoursAgo: 3 },
    ],
  },
  {
    phone: "5215612340002",
    name: "Carlos Ramos",
    stage: "Em conversa",
    thread: [
      { dir: "in", text: "Boa tarde, quanto tá o saco de cimento?", hoursAgo: 8 },
      { dir: "out", text: "Oi, Carlos! O saco de 50 kg está US$ 12. Levando 10 ou mais, fica US$ 11 cada.", hoursAgo: 8, ai: true },
      { dir: "in", text: "Preciso de 15 sacos, vocês entregam em Kissimmee?", hoursAgo: 7 },
      { dir: "out", text: "Entregamos sim, em toda a região. O frete é US$ 25 e chega no mesmo dia se confirmar antes das 13h. Total: 15 × US$ 11 + US$ 25 = US$ 190.", hoursAgo: 7, ai: true },
    ],
  },
  {
    phone: "5215612340003",
    name: "Lúcia Henriques",
    stage: "Cliente",
    notes: "Compra recorrente para a marcenaria dela.",
    thread: [
      { dir: "in", text: "Oi de novo, acabou meu verniz 😅", hoursAgo: 30 },
      { dir: "out", text: "Oi, Lúcia! Separamos 2 litros do verniz marítimo que você sempre leva: US$ 28. Mando junto com o seu pedido de lixas?", hoursAgo: 30, ai: true },
      { dir: "in", text: "Sim, por favor, junta tudo numa entrega só", hoursAgo: 29 },
      { dir: "out", text: "Pronto, sai hoje mesmo. Total: US$ 42 com as lixas. Obrigado pela compra!", hoursAgo: 29, ai: true },
    ],
  },
  {
    phone: "5215612340004",
    name: "Jorge Castilho",
    stage: "Novo",
    thread: [
      { dir: "in", text: "eae, tem tinta latex branka de 18 lts?", hoursAgo: 2 },
      { dir: "out", text: "Opa, Jorge! Tem sim: a lata de 18 L de látex branco está US$ 65 (rende ~90 m²). Você quer fosca ou acetinada?", hoursAgo: 2, ai: true },
    ],
  },
  {
    phone: "5215612340005",
    name: "Ana Sofia Torres",
    stage: "Interessado",
    thread: [
      { dir: "in", text: "Oi, vi o anúncio de vocês. Vocês trabalham com material elétrico?", hoursAgo: 12 },
      { dir: "out", text: "Oi, Ana! Sim: cabos, tomadas, disjuntores e quadros de distribuição. Do que você precisa para o seu projeto?", hoursAgo: 12, ai: true },
      { dir: "in", text: "Preciso de 100 m de cabo calibre 12 e 10 tomadas duplas", hoursAgo: 11 },
      { dir: "out", text: "Segue o orçamento: rolo de 100 m cal. 12 THHN US$ 95 + 10 tomadas duplas Leviton US$ 2 cada = US$ 115. Quer que eu prepare?", hoursAgo: 11, ai: true },
      { dir: "in", text: "Deixa eu confirmar com o eletricista e te aviso", hoursAgo: 10 },
    ],
  },
  {
    phone: "5215612340006",
    name: "Roberto Mendes",
    stage: "Perdido",
    notes: "Queria preço de atacado que não conseguimos igualar.",
    thread: [
      { dir: "in", text: "Quanto tá a tonelada de vergalhão 3/8?", hoursAgo: 96 },
      { dir: "out", text: "Oi, Roberto: a tonelada de vergalhão 3/8 está US$ 890. Para quando você precisa?", hoursAgo: 96, ai: true },
      { dir: "in", text: "Ih, não, em outro lugar me fazem por 800", hoursAgo: 95 },
      { dir: "out", text: "Entendo. Esse preço a gente não consegue, mas se o seu fornecedor falhar estamos aqui com entrega no mesmo dia. Sucesso na obra!", hoursAgo: 95, ai: true },
    ],
  },
  {
    phone: "5215612340007",
    name: "Paty Domingues",
    stage: "Em conversa",
    thread: [
      { dir: "in", text: "Oi, vocês têm impermeabilizante? Tá chovendo dentro de casa pela laje 😩", hoursAgo: 26 },
      { dir: "out", text: "Oi, Paty! Claro: o impermeabilizante acrílico 5 anos (balde de 18 L) está US$ 89 e cobre ~40 m². Quantos metros tem a sua laje?", hoursAgo: 26, ai: true },
      { dir: "in", text: "Uns 60 metros, dois baldes dão?", hoursAgo: 25 },
    ],
  },
  {
    phone: "5215612340008",
    name: "Seu Chico Aguiar",
    stage: "Cliente",
    thread: [
      { dir: "in", text: "Moço, me manda a lista de sempre pra equipe da obra", hoursAgo: 50 },
      { dir: "out", text: "Com prazer, Seu Chico! O pedido de sempre: 5 sacos de cimento, 2 de argamassa, 1 rolo de arame recozido e 3 kg de prego. Total: US$ 92. Mandamos para a obra da Orange Ave.?", hoursAgo: 50, ai: true },
      { dir: "in", text: "Isso, lá mesmo. Pago na entrega como sempre", hoursAgo: 49 },
      { dir: "out", text: "Perfeito, sai na caminhonete das 16h. Obrigado, Seu Chico!", hoursAgo: 49, ai: true },
    ],
  },
];

const DEMO_KB: { kind: "qa" | "block"; question?: string; answer?: string; content?: string }[] = [
  {
    kind: "block",
    content:
      "Ferragem O Martelo — loja de ferragens familiar com 20 anos no centro da cidade. Vendemos ferramentas manuais e elétricas, material de construção, tintas, hidráulica e material elétrico. Atendemos o público em geral, mestres de obra e oficinas.",
  },
  { kind: "qa", question: "Qual é o horário?", answer: "Segunda a sábado das 8h às 19h e domingos das 9h às 14h." },
  { kind: "qa", question: "Onde vocês ficam?", answer: "245 Orange Ave., no centro. Há estacionamento gratuito para clientes na rua lateral." },
  { kind: "qa", question: "Vocês fazem entrega?", answer: "Sim: entrega no mesmo dia na região se confirmar antes das 13h. Frete local US$ 25; grátis em compras acima de US$ 150." },
  { kind: "qa", question: "Quais formas de pagamento vocês aceitam?", answer: "Dinheiro, cartão (crédito/débito), Zelle e pagamento na entrega em pedidos locais." },
  { kind: "qa", question: "Vocês emitem nota fiscal?", answer: "Sim, emitimos no mesmo dia. Envie os dados da empresa e o comprovante de compra." },
  { kind: "qa", question: "Vocês têm preço de atacado?", answer: "Sim: em cimento, argamassa e vergalhão há preço especial a partir de 10 unidades; em tintas a partir de 5 latas. Peça seu orçamento pelo WhatsApp." },
  { kind: "qa", question: "Quais marcas de ferramenta vocês trabalham?", answer: "Black+Decker, DeWalt, Makita e Ryobi em elétricas; Leviton e Eaton em material elétrico; Sherwin-Williams e Behr em tintas." },
  // HUECO INTENCIONAL: nada sobre garantías ni devoluciones (lo encuentra el Laboratorio).
];

export async function seedDemo(
  db: Db,
  organizationId: string
): Promise<{ contacts: number; kbEntries: number }> {
  const demoPhones = DEMO_CONTACTS.map((c) => c.phone);

  // --- Idempotencia: limpiar datos demo previos (orden inverso de FKs) ---
  const prevContacts = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(inArray(schema.contact.phone, demoPhones));
  const prevIds = prevContacts.map((c) => c.id);
  if (prevIds.length > 0) {
    const prevConvs = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(inArray(schema.conversation.contactId, prevIds));
    const convIds = prevConvs.map((c) => c.id);
    if (convIds.length > 0) {
      await db
        .delete(schema.message)
        .where(inArray(schema.message.conversationId, convIds));
      await db
        .delete(schema.conversation)
        .where(inArray(schema.conversation.id, convIds));
    }
    await db.delete(schema.lead).where(inArray(schema.lead.contactId, prevIds));
    await db.delete(schema.contact).where(inArray(schema.contact.id, prevIds));
  }
  // KB y corridas demo previas
  await db
    .delete(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, organizationId));
  await db
    .delete(schema.agentTestCase)
    .where(eq(schema.agentTestCase.organizationId, organizationId));
  await db
    .delete(schema.agentTestRun)
    .where(eq(schema.agentTestRun.organizationId, organizationId));

  // --- Etapas (por nombre) ---
  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(eq(schema.pipelineStage.organizationId, organizationId));
  const stageByName = new Map(stages.map((s) => [s.name, s.id]));
  const fallbackStage = stages[0]?.id;
  if (!fallbackStage) throw new Error("A organização não tem etapas");

  // --- Contactos + conversaciones + mensajes + leads ---
  const now = Date.now();
  let position = 0;
  for (const demo of DEMO_CONTACTS) {
    const contactId = newId("contact");
    await db.insert(schema.contact).values({
      id: contactId,
      organizationId,
      phone: demo.phone,
      waIdentity: demo.phone,
      name: demo.name,
      notes: demo.notes ?? null,
    });

    const lastInbound = demo.thread
      .filter((t) => t.dir === "in")
      .reduce((min, t) => Math.min(min, t.hoursAgo), Infinity);
    const lastMessage = demo.thread.reduce(
      (min, t) => Math.min(min, t.hoursAgo),
      Infinity
    );

    const conversationId = newId("conversation");
    await db.insert(schema.conversation).values({
      id: conversationId,
      organizationId,
      contactId,
      lastInboundAt: new Date(now - lastInbound * HOURS),
      lastMessageAt: new Date(now - lastMessage * HOURS),
      unreadCount: demo.thread[demo.thread.length - 1]?.dir === "in" ? 1 : 0,
    });

    for (const msg of demo.thread) {
      const at = new Date(now - msg.hoursAgo * HOURS);
      await db.insert(schema.message).values({
        id: newId("message"),
        organizationId,
        conversationId,
        waMessageId: `wamid.demo.${newId("message")}`,
        direction: msg.dir,
        type: "text",
        text: msg.text,
        status: msg.dir === "in" ? "delivered" : "read",
        aiGenerated: msg.ai ?? false,
        origin: msg.ai ? "ai" : "operator",
        waTimestamp: at,
        createdAt: at,
      });
    }

    await db.insert(schema.lead).values({
      id: newId("lead"),
      organizationId,
      contactId,
      stageId: stageByName.get(demo.stage) ?? fallbackStage,
      position: position++,
      lastActivityAt: new Date(now - lastMessage * HOURS),
    });
  }

  // --- Knowledge base (con el hueco intencional) ---
  for (const entry of DEMO_KB) {
    await db.insert(schema.kbEntry).values({
      id: newId("kbEntry"),
      organizationId,
      kind: entry.kind,
      question: entry.question ?? null,
      answer: entry.answer ?? null,
      content: entry.content ?? null,
    });
  }

  // --- Comportamiento del agente de la demo ---
  await db
    .update(schema.agentProfile)
    .set({
      name: "Martelinho",
      tone: "Próximo e prático, de loja de bairro de confiança. Trata o cliente por você.",
      instructions:
        "Ajuda a fazer orçamentos e fechar vendas. Dá preços em US$ só se estiverem no conhecimento. Se pedirem atacado, menciona os mínimos. Nunca inventa estoque.",
      escalationRules:
        "Escala para um humano se pedirem nota fiscal com dados complexos, se houver reclamação de produto com defeito ou se pedirem explicitamente.",
      greeting: "Olá! Sou o Martelinho, o assistente da Ferragem O Martelo 🔨",
      updatedAt: new Date(),
    })
    .where(eq(schema.agentProfile.organizationId, organizationId));

  // --- Corrida de Laboratorio de ejemplo (guardada, con el hueco encontrado) ---
  const runId = newId("testRun");
  await db.insert(schema.agentTestRun).values({
    id: runId,
    organizationId,
    status: "done",
    score: 83,
    startedAt: new Date(now - 24 * HOURS),
    finishedAt: new Date(now - 24 * HOURS + 3 * 60 * 1000),
  });
  const exampleCases: {
    persona: string;
    veredicto: "verde" | "amarillo" | "rojo";
    hallazgos: unknown[];
    transcript: { role: string; text: string }[];
  }[] = [
    {
      persona: "comprador_decidido",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "Vocês têm furadeiras sem fio disponíveis?" },
        { role: "agente", text: "Temos! Black+Decker 20V por US$ 99 e DeWalt 20V MAX por US$ 179." },
        { role: "cliente", text: "Gostei, vou comprar. Como eu pago?" },
        { role: "agente", text: "Aceitamos dinheiro, cartão, Zelle ou pagamento na entrega. Já separo para você." },
      ],
    },
    {
      persona: "pregunton_precios",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "Qual o preço do martelo?" },
        { role: "agente", text: "Temos vários; o mais pedido é o martelo de unha Stanley. Confirmo preço e estoque com a equipe?" },
      ],
    },
    {
      persona: "cliente_enojado",
      veredicto: "amarillo",
      hallazgos: [
        {
          tipo: "tono",
          evidencia:
            "O agente respondeu certo, mas meio frio diante de 'é uma porcaria'; faltou empatia antes de escalar.",
        },
      ],
      transcript: [
        { role: "cliente", text: "Comprei uma lixadeira semana passada e ela já não liga, é uma porcaria" },
        { role: "agente", text: "Sinto muito pelo problema. Vou passar seu caso para um colega da equipe resolver." },
      ],
    },
    {
      persona: "fuera_de_kb",
      veredicto: "rojo",
      hallazgos: [
        {
          tipo: "fuera_de_kb",
          evidencia:
            "O cliente perguntou sobre garantia e devolução e o conhecimento não cobre isso.",
          sugerencia: {
            pregunta: "Qual é a política de garantia e devolução?",
            respuesta:
              "Aceitamos devoluções em até 30 dias com o comprovante de compra; a garantia depende do fabricante.",
          },
        },
      ],
      transcript: [
        { role: "cliente", text: "Qual é a política de garantia e devolução de vocês?" },
        { role: "agente", text: "Deixa eu confirmar com a equipe e já te falo." },
      ],
    },
    {
      persona: "pide_humano",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "Prefiro ser atendido por uma pessoa, quero falar com um humano" },
        { role: "agente", text: "(handoff: a conversa passou para atendimento humano)" },
      ],
    },
    {
      persona: "errores_modismos",
      veredicto: "verde",
      hallazgos: [],
      transcript: [
        { role: "cliente", text: "eae, vcs vendem tinta?" },
        { role: "agente", text: "Claro! Trabalhamos com Sherwin-Williams e Behr. O que você precisa pintar?" },
      ],
    },
  ];
  for (const c of exampleCases) {
    await db.insert(schema.agentTestCase).values({
      id: newId("testCase"),
      organizationId,
      runId,
      persona: c.persona,
      status: "done",
      veredicto: c.veredicto,
      hallazgos: c.hallazgos,
      transcript: c.transcript,
    });
  }

  return { contacts: DEMO_CONTACTS.length, kbEntries: DEMO_KB.length };
}

/** true si la organización aún no tiene datos de dominio (para el botón). */
export async function isDomainEmpty(
  db: Db,
  organizationId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(eq(schema.contact.organizationId, organizationId))
    .limit(1);
  return rows.length === 0;
}
