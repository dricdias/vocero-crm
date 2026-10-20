import { getEvolutionByOrg } from "@/server/evolution/credentials";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { estadoIaDe, mensajeDeEstado } from "@/lib/ai/provider";
import { agendaEnabled } from "@/server/agenda/flag";
import { verifyCalendar } from "./calendar-verifiers";

/**
 * Qué le falta a esta instancia para que el agente conteste (issue #86).
 *
 * Puerto de `onboarding/status.ts` de Vocero Cloud recortado a lo que la raíz
 * tiene: el perfil del agente, la credencial de IA (la fila de Ajustes → IA
 * o, de respaldo, `OPENROUTER_*` del entorno), el número de WhatsApp y, solo
 * con `AGENDA=on`, la agenda. Nada de modelo de plataforma, dueño invitado,
 * cerebro compartido, cobertura ni evidencia de prueba: aquí una instancia es
 * un negocio y quien la instala es quien la configura.
 *
 * Cada paso sale de la MISMA fuente que ya decide si esa pieza funciona
 * (`estadoIaDe`, el `status` de la conexión, el catálogo de conectores): la
 * guía no inventa su propia noción de «listo».
 */
export type ReadinessStatus =
  | "ready"
  | "pending"
  | "unsupported"
  | "not_applicable";

export type ReadinessKey = "profile" | "ai" | "whatsapp" | "calendar";

export type ReadinessStep = {
  key: ReadinessKey;
  label: string;
  status: ReadinessStatus;
  /** Qué hacer para dejarlo listo; en `ready`, qué quedó. */
  nextAction: string;
  href: string | null;
  /**
   * Lo que está MAL, cuando no es simplemente que falte el paso: la llave
   * rechazada, el token de WhatsApp vencido, un conector sin credencial. La
   * guía lo pinta en ámbar debajo del paso.
   */
  problem: string | null;
};

export type OnboardingStatus = {
  steps: ReadinessStep[];
  /** El agente ya está encendido. */
  enabled: boolean;
};

type Db = ReturnType<typeof getDb>;

export async function onboardingStatus(
  organizationId: string,
  db: Db = getDb()
): Promise<OnboardingStatus> {
  const [profile] = await db
    .select({
      name: schema.agentProfile.name,
      instructions: schema.agentProfile.instructions,
      enabled: schema.agentProfile.enabled,
    })
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  const [kb] = await db
    .select({ id: schema.kbEntry.id })
    .from(schema.kbEntry)
    .where(scoped(schema.kbEntry.organizationId, organizationId))
    .limit(1);
  const [metaChannel] = await db
    .select({ status: schema.metaCredentials.status })
    .from(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId))
    .limit(1);
  const evolution = await getEvolutionByOrg(organizationId, db);
  const channel = evolution ?? metaChannel;
  const ia = await estadoIaDe(organizationId);

  const steps: ReadinessStep[] = [
    pasoPerfil(profile, Boolean(kb)),
    {
      key: "ai",
      label: "Provedor de IA",
      status: ia.activa ? "ready" : "pending",
      nextAction: ia.activa
        ? ia.origen === "org"
          ? "Chave salva em Configurações → IA"
          : "Reserva do ambiente (OPENROUTER_*)"
        : "Cole a chave do seu provedor e escolha o modelo em Configurações → IA",
      href: "/settings/ai",
      // «Sin configurar» es lo obvio del paso; lo que sí hay que decir es por
      // qué una llave que el dueño YA pegó no sirve.
      problem:
        !ia.activa && ia.motivo !== "sin_configurar"
          ? mensajeDeEstado(ia)
          : null,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      status: channel?.status === "connected" ? "ready" : "pending",
      nextAction:
        channel?.status === "connected"
          ? "Número conectado"
          : channel
            ? "Conecte o número de novo com um token válido"
            : "Vincular seu número",
      href: "/settings/whatsapp",
      problem:
        channel?.status === "reconnect_required"
          ? "A Meta deixou de aceitar o token do WhatsApp: conecte o número de novo."
          : null,
    },
  ];

  if (agendaEnabled()) {
    steps.push(await pasoAgenda(organizationId, db));
  } else {
    // Sin la bandera, la agenda no existe en esta instancia (015): el paso se
    // reporta para que la guía sepa que no aplica, sin enlace a una pantalla
    // que respondería 404.
    steps.push({
      key: "calendar",
      label: "Agenda",
      status: "not_applicable",
      nextAction:
        "A agenda não está ligada nesta instância (variável AGENDA).",
      href: null,
      problem: null,
    });
  }

  return { steps, enabled: profile?.enabled ?? false };
}

type Perfil = { name: string; instructions: string | null; enabled: boolean };

/**
 * El agente está «configurado» cuando tiene con qué contestar: instrucciones
 * o conocimiento. El nombre viene con default («Asistente»), así que no es
 * lo que distingue a un perfil trabajado de uno recién sembrado.
 */
function pasoPerfil(profile: Perfil | undefined, hayConocimiento: boolean): ReadinessStep {
  const listo =
    Boolean(profile?.name.trim()) &&
    (Boolean(profile?.instructions?.trim()) || hayConocimiento);
  return {
    key: "profile",
    label: "Configuração do agente",
    status: listo ? "ready" : "pending",
    nextAction: listo
      ? "Nome, instruções e conhecimento revisados"
      : "Dê um nome e escreva as instruções ou carregue conhecimento do negócio",
    href: "/agent",
    problem: null,
  };
}

async function pasoAgenda(organizationId: string, db: Db): Promise<ReadinessStep> {
  const [settings] = await db
    .select({
      connector: schema.calendarSettings.connector,
      weeklyHours: schema.calendarSettings.weeklyHours,
    })
    .from(schema.calendarSettings)
    .where(scoped(schema.calendarSettings.organizationId, organizationId))
    .limit(1);
  const [zoom] = await db
    .select({ status: schema.zoomCredentials.status })
    .from(schema.zoomCredentials)
    .where(scoped(schema.zoomCredentials.organizationId, organizationId))
    .limit(1);
  const [google] = await db
    .select({ status: schema.googleCredentials.status })
    .from(schema.googleCredentials)
    .where(scoped(schema.googleCredentials.organizationId, organizationId))
    .limit(1);

  const status = verifyCalendar(settings, {
    zoom: zoom?.status === "connected",
    google: google?.status === "connected",
  });

  let problem: string | null = null;
  if (status === "unsupported") {
    problem = `O conector «${settings?.connector}» não existe nesta instância: escolha outro em Configurações → Agenda.`;
  } else if (status === "pending" && settings && settings.connector !== "enlace-fijo") {
    const nombre = settings.connector === "zoom" ? "Zoom" : "Google";
    const cred = settings.connector === "zoom" ? zoom : google;
    problem = cred
      ? `${nombre} rejeitou a credencial salva: conecte de novo em Configurações → Agenda.`
      : `Você escolheu ${nombre}, mas ele não está conectado: cole as credenciais em Configurações → Agenda.`;
  }

  return {
    key: "calendar",
    label: "Agenda",
    status,
    nextAction:
      status === "ready"
        ? "Horários e conector prontos"
        : "Salve seus horários e como a reunião é feita em Configurações → Agenda",
    href: "/settings/calendar",
    problem,
  };
}
