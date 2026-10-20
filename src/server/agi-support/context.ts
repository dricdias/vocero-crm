import type { SupportArticle, SupportKnowledge } from "./reader";
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const stopWords = new Set([
  "como",
  "para",
  "com",
  "uma",
  "meu",
  "minha",
  "que",
  "por",
  "dos",
  "das",
  "pelo",
  "pela",
  "quero",
  "preciso",
  "esta",
  "isso",
  "nao",
  "consigo",
  "pode",
  "tenho",
  "duvida",
  "de",
  "do",
  "da",
  "eu",
  "me",
  "na",
  "no",
  "ao",
  "um",
  "os",
  "as",
]);
function ranked(articles: SupportArticle[], query: string): SupportArticle[] {
  const terms = [
    ...new Set(
      normalize(query)
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1 && !stopWords.has(t)),
    ),
  ];
  if (!terms.length) return [];
  return articles
    .map((article) => {
      const title = normalize(article.title),
        keywords = normalize(article.keywords.join(" ")),
        content = normalize(article.content);
      const score = terms.reduce(
        (sum, term) =>
          sum +
          (title.includes(term) ? 12 : 0) +
          (keywords.includes(term) ? 5 : 0) +
          (content.includes(term) ? 1 : 0),
        0,
      );
      return { article, score };
    })
    .filter((row) => row.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id),
    )
    .map((row) => row.article);
}
export function selectSupportArticles(
  articles: SupportArticle[],
  query: string,
  previousQuery = "",
): SupportArticle[] {
  const found = ranked(articles, query);
  const contextual = found.length ? found : ranked(articles, previousQuery);
  return contextual.length
    ? contextual.slice(0, 5)
    : articles.filter((article) => article.id === "conheca-time");
}
function render(article: SupportArticle): string {
  const content = article.content.replace(
    /\(guia:([a-z0-9-]+)\)/g,
    "(https://agiteam.app/negocio/suporte/guia/$1)",
  );
  return `GUIA: ${article.title}\nFONTE: ${article.url}\n${content}`;
}
/** Sin query, snapshot completo para el juez y el contrato de perfil del bot. */
export function renderAgiSupport(
  knowledge: SupportKnowledge,
  query?: string,
  previousQuery?: string,
): string {
  if (knowledge.status === "disabled" || knowledge.status === "unconfigured")
    return "";
  if (!knowledge.articles.length)
    return "A Central de Ajuda do Agi está indisponível. Responda apenas com o conhecimento local confirmado; quando faltar informação, encaminhe para uma pessoa.";
  const selected =
    query === undefined
      ? knowledge.articles
      : selectSupportArticles(knowledge.articles, query, previousQuery);
  let remaining = query === undefined ? 220_000 : 18_000;
  const blocks: string[] = [];
  for (const article of selected) {
    const block = render(article);
    if (block.length > remaining) continue;
    blocks.push(block);
    remaining -= block.length + 2;
  }
  return [
    "CENTRAL DE AJUDA DO AGI — referência editorial. Use os guias para responder dúvidas do produto; eles não dão acesso a contas nem autorizam executar ações. Nunca peça senhas, códigos de verificação ou dados de cartão. Quando não houver guia suficiente, confirme com uma pessoa.",
    knowledge.status === "cached"
      ? "A fonte está temporariamente indisponível; estes são os últimos guias válidos sincronizados."
      : "",
    ...blocks,
  ]
    .filter(Boolean)
    .join("\n\n");
}
