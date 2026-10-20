import type { SessionContext } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import {
  onboardingStatus,
  type OnboardingStatus,
  type ReadinessStep,
} from "./status";

/**
 * La guía de inicio: tres pasos (cuatro con la agenda) y nada más (issue #86).
 *
 * Es lo primero que ve quien instala Vocero: configurar el agente, vincular
 * el proveedor de IA, conectar el número y, si la agenda existe en esta
 * instancia, dejarla lista. Al terminar, un botón enciende el agente. Lo
 * demás —la Bandeja, el Pipeline— ya está en el menú; la guía no lo repite.
 *
 * El estado de cada paso sale de `onboardingStatus`, la misma fuente que ya
 * verifica cada conexión: la guía no inventa su propia noción de «listo».
 * Puerto de `onboarding/guide.ts` de Vocero Cloud sin lo que allá es de la
 * plataforma (modelo fijado por soporte, agencias, planes).
 */
export type GuideStep = {
  key: "agent" | "ai" | "whatsapp" | "calendar";
  title: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
  /** Lo que falta, cuando no es lo obvio del paso. */
  hint: string | null;
};

export type Guide = {
  steps: GuideStep[];
  complete: boolean;
  /** El agente ya está encendido. */
  enabled: boolean;
};

const ready = (s: ReadinessStep | undefined) => s?.status === "ready";

/** Pura: de los pasos verificados a los de la guía. */
export function guideFrom(status: OnboardingStatus): Guide {
  const step = (key: ReadinessStep["key"]) =>
    status.steps.find((s) => s.key === key);
  const profile = step("profile");
  const ai = step("ai");
  const whatsapp = step("whatsapp");
  const calendar = step("calendar");

  const steps: GuideStep[] = [
    {
      key: "agent",
      title: "Configure seu agente",
      description:
        "Dê um nome e conte o que seu negócio faz. Se quiser ver um exemplo antes, carregue a demo pela Caixa de entrada e troque pelos seus dados.",
      done: ready(profile),
      href: "/agent",
      cta: "Ir para Agente",
      hint: ready(profile) ? null : (profile?.nextAction ?? null),
    },
    {
      key: "ai",
      title: "Vincule seu provedor de IA",
      description:
        "É a conta com a qual seu agente pensa: OpenRouter ou qualquer provedor compatível com a API da OpenAI. Você cria e paga; aqui você só cola a chave e escolhe o modelo.",
      done: ready(ai),
      href: "/settings/ai",
      cta: "Vincular provedor",
      hint: ai?.problem ?? null,
    },
    {
      key: "whatsapp",
      title: "Vincule seu número de WhatsApp",
      description:
        "Conecte o número onde seus clientes te escrevem. O CRM registra o webhook na Meta para você ao salvar.",
      done: ready(whatsapp),
      href: "/settings/whatsapp",
      cta: "Conectar WhatsApp",
      hint: whatsapp?.problem ?? null,
    },
  ];
  // Sin agenda en esta instancia el paso no existe: pintarlo «no aplica»
  // sería justo el tipo de ruido que la guía evita.
  if (calendar && calendar.status !== "not_applicable") {
    steps.push({
      key: "calendar",
      title: "Configure sua agenda",
      description:
        "Defina seus horários e como a reunião é feita para que seu agente possa agendar por você.",
      done: ready(calendar),
      href: "/settings/calendar",
      cta: "Configurar agenda",
      hint: calendar.problem,
    });
  }
  return { steps, complete: steps.every((s) => s.done), enabled: status.enabled };
}

export async function guideStatus(organizationId: string): Promise<Guide> {
  return guideFrom(await onboardingStatus(organizationId));
}

/**
 * ¿La guía es lo primero que ve esta persona al entrar?
 *
 * Solo a quien puede configurar (un miembro del equipo no puede hacer ninguno
 * de los pasos) y solo mientras falte algo: con todos los pasos listos y el
 * agente encendido se entra directo a la Bandeja, como siempre.
 *
 * Un negocio demo recién sembrado («Ferretería El Martillo») pasa por aquí
 * igual: el seed deja el agente configurado (paso 1 listo) pero no puede
 * vincular una llave de IA ni un número, y sin eso el agente no contesta.
 * Capturar `/` no encierra a nadie: el menú lleva a cualquier pantalla.
 */
export async function guideFirst(
  session: Pick<SessionContext, "organizationId" | "role">
): Promise<boolean> {
  if (!canConfigure(session.role)) return false;
  const guide = await guideStatus(session.organizationId);
  return !guide.complete || !guide.enabled;
}
