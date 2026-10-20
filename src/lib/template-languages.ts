/**
 * Idiomas que Meta acepta para plantillas de WhatsApp Cloud API.
 *
 * Copiado de la lista oficial («Supported Languages», actualizada por Meta el
 * 21-may-2026). El código es lo que viaja a Meta; el nombre es para el
 * selector. Un código fuera de esta lista Meta lo rechaza, así que el servidor
 * valida contra ella antes de gastar la llamada.
 *
 * Puro y sin dependencias: lo usan la API, la pantalla de Plantillas y el
 * selector de la Bandeja.
 *
 * pt-BR: nombres en portugués y el portugués de Brasil primero (es el idioma
 * por defecto de esta versión).
 */

export type TemplateLanguageGroup = "es" | "pt-en" | "otros";

type Entry = { code: string; name: string; group: TemplateLanguageGroup };

const PORTUGUES_E_INGLES: Entry[] = [
  { code: "pt_BR", name: "Português (Brasil)", group: "pt-en" },
  { code: "pt_PT", name: "Português (Portugal)", group: "pt-en" },
  { code: "en_US", name: "Inglês (EUA)", group: "pt-en" },
  { code: "en", name: "Inglês (geral)", group: "pt-en" },
  { code: "en_GB", name: "Inglês (Reino Unido)", group: "pt-en" },
  { code: "en_CA", name: "Inglês (Canadá)", group: "pt-en" },
  { code: "en_AU", name: "Inglês (Austrália)", group: "pt-en" },
  { code: "en_IE", name: "Inglês (Irlanda)", group: "pt-en" },
  { code: "en_IN", name: "Inglês (Índia)", group: "pt-en" },
  { code: "en_JM", name: "Inglês (Jamaica)", group: "pt-en" },
  { code: "en_NZ", name: "Inglês (Nova Zelândia)", group: "pt-en" },
  { code: "en_SG", name: "Inglês (Singapura)", group: "pt-en" },
  { code: "en_ZA", name: "Inglês (África do Sul)", group: "pt-en" },
  { code: "en_AE", name: "Inglês (Emirados Árabes)", group: "pt-en" },
  { code: "en_GH", name: "Inglês (Gana)", group: "pt-en" },
  { code: "en_MY", name: "Inglês (Malásia)", group: "pt-en" },
  { code: "en_QA", name: "Inglês (Catar)", group: "pt-en" },
  { code: "en_UG", name: "Inglês (Uganda)", group: "pt-en" },
];

const ESPANOL: Entry[] = [
  { code: "es_MX", name: "Espanhol (México)", group: "es" },
  { code: "es", name: "Espanhol (geral)", group: "es" },
  { code: "es_AR", name: "Espanhol (Argentina)", group: "es" },
  { code: "es_CL", name: "Espanhol (Chile)", group: "es" },
  { code: "es_CO", name: "Espanhol (Colômbia)", group: "es" },
  { code: "es_CR", name: "Espanhol (Costa Rica)", group: "es" },
  { code: "es_EC", name: "Espanhol (Equador)", group: "es" },
  { code: "es_ES", name: "Espanhol (Espanha)", group: "es" },
  { code: "es_HN", name: "Espanhol (Honduras)", group: "es" },
  { code: "es_PA", name: "Espanhol (Panamá)", group: "es" },
  { code: "es_PE", name: "Espanhol (Peru)", group: "es" },
  { code: "es_DO", name: "Espanhol (República Dominicana)", group: "es" },
  { code: "es_UY", name: "Espanhol (Uruguai)", group: "es" },
];

const OTROS: Entry[] = (
  [
    ["af", "Africâner"], ["sq", "Albanês"], ["de", "Alemão"],
    ["de_AT", "Alemão (Áustria)"], ["de_CH", "Alemão (Suíça)"], ["ar", "Árabe"],
    ["ar_EG", "Árabe (Egito)"], ["ar_AE", "Árabe (Emirados Árabes)"],
    ["ar_LB", "Árabe (Líbano)"], ["ar_MA", "Árabe (Marrocos)"],
    ["ar_QA", "Árabe (Catar)"], ["az", "Azerbaijano"], ["be_BY", "Bielorrusso"],
    ["bn", "Bengali"], ["bn_IN", "Bengali (Índia)"], ["bg", "Búlgaro"],
    ["kn", "Canarês"], ["ca", "Catalão"], ["cs", "Tcheco"],
    ["zh_CN", "Chinês (China)"], ["zh_HK", "Chinês (Hong Kong)"],
    ["zh_TW", "Chinês (Taiwan)"], ["si_LK", "Cingalês"], ["ko", "Coreano"],
    ["hr", "Croata"], ["da", "Dinamarquês"], ["prs_AF", "Dari"], ["sk", "Eslovaco"],
    ["sl", "Esloveno"], ["et", "Estoniano"], ["fil", "Filipino"],
    ["fi", "Finlandês"], ["fr", "Francês"], ["fr_BE", "Francês (Bélgica)"],
    ["fr_CA", "Francês (Canadá)"], ["fr_CI", "Francês (Costa do Marfim)"],
    ["fr_MA", "Francês (Marrocos)"], ["fr_CH", "Francês (Suíça)"],
    ["ka", "Georgiano"], ["el", "Grego"], ["gu", "Guzerate"], ["ha", "Hauçá"],
    ["he", "Hebraico"], ["hi", "Híndi"], ["hu", "Húngaro"], ["id", "Indonésio"],
    ["ga", "Irlandês"], ["it", "Italiano"], ["ja", "Japonês"], ["kk", "Cazaque"],
    ["rw_RW", "Quiniaruanda"], ["ky_KG", "Quirguiz"], ["lo", "Laosiano"],
    ["lv", "Letão"], ["lt", "Lituano"], ["mk", "Macedônio"],
    ["ml", "Malaiala"], ["ms", "Malaio"], ["mr", "Marati"],
    ["nl", "Holandês"], ["nl_BE", "Holandês (Bélgica)"], ["nb", "Norueguês"],
    ["pa", "Panjabi"], ["ps_AF", "Pashto"], ["fa", "Persa"], ["pl", "Polonês"],
    ["ro", "Romeno"], ["ru", "Russo"], ["sr", "Sérvio"], ["sw", "Suaíli"],
    ["sv", "Sueco"], ["th", "Tailandês"], ["ta", "Tâmil"], ["te", "Télugo"],
    ["tr", "Turco"], ["uk", "Ucraniano"], ["ur", "Urdu"], ["uz", "Uzbeque"],
    ["vi", "Vietnamita"], ["zu", "Zulu"],
  ] as const
).map(([code, name]) => ({ code, name, group: "otros" as const }));

export const TEMPLATE_LANGUAGES: readonly Entry[] = [
  ...PORTUGUES_E_INGLES,
  ...ESPANOL,
  ...OTROS,
];

export const TEMPLATE_LANGUAGE_GROUPS: { id: TemplateLanguageGroup; label: string }[] = [
  { id: "pt-en", label: "Português e inglês" },
  { id: "es", label: "Espanhol" },
  { id: "otros", label: "Outros idiomas" },
];

export const DEFAULT_TEMPLATE_LANGUAGE = "pt_BR";

const BY_CODE = new Map(TEMPLATE_LANGUAGES.map((l) => [l.code, l.name]));

export function isTemplateLanguage(code: string): boolean {
  return BY_CODE.has(code);
}

export function templateLanguageName(code: string): string {
  return BY_CODE.get(code) ?? code;
}
