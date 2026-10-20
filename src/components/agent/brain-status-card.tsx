"use client";

import { AlertTriangle, Cable, Info, Send, Sparkles, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  despachoFallando,
  externalBrainName,
  haceCuanto,
  type BrainDispatchDto,
  type BrainHealthDto,
  type BrainRelayDto,
  type BrainStatusDto,
} from "@/lib/brain-status";
import { cn } from "@/lib/utils";

/**
 * «Quién responde a tus clientes»: arriba de la pantalla del Agente, porque
 * el interruptor de esta página solo gobierna al agente incluido. Un cerebro
 * externo (Nea) contesta por su cuenta, y con los dos activos el cliente
 * recibe dos respuestas distintas.
 *
 * 021 — Con el despacho (`BRAIN_DISPATCH_URL`) el CRM le pasa cada turno al
 * cerebro y calla al agente incluido: la tercera fila dice a quién, cuándo
 * llegó el último y si alguno no llegó.
 */

type Tone = "ok" | "warn" | "off";
type RowView = { tone: Tone; headline: string; detail: string | null };

const DOT: Record<Tone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  off: "bg-border-strong",
};

export function BrainStatusCard({
  status,
  now = Date.now(),
}: {
  status: BrainStatusDto;
  now?: number;
}) {
  const name = externalBrainName(status);
  const lastSeenAt = status.external.lastSeenAt;

  return (
    <Card data-brain-card data-warning={status.warning ?? "ninguno"}>
      <CardHeader className="pb-4">
        <CardTitle>Quem responde seus clientes</CardTitle>
        <CardDescription>
          O que responde os WhatsApp desta instância. Tem que ser um só:
          se dois responderem, seu cliente recebe duas respostas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.warning === "doble_respuesta" && (
          <Callout tone="danger" icon={AlertTriangle} title="Seus clientes podem receber duas respostas">
            O agente incluído e {name ? `seu cérebro externo (${name})` : "seu cérebro externo"}{" "}
            respondem as mesmas mensagens: desligue o agente incluído no botão
            acima ou remova a chave de IA em Configurações → IA.
          </Callout>
        )}
        {status.warning === "sin_cerebro" && (
          <Callout tone="warning" icon={Info} title="Ninguém responde automaticamente">
            Seus clientes só recebem o que você responder pela caixa de entrada: ligue o
            agente incluído (precisa de um provedor de IA em Configurações → IA) ou conecte seu
            cérebro externo com <Env>BOT_API_KEY</Env>.
          </Callout>
        )}

        <dl className="divide-y rounded-md border">
          <BrainRow
            id="embedded"
            icon={Sparkles}
            label="Agente incluído"
            hint="O do Vocero, com o comportamento desta página."
            view={embeddedView(status)}
          />
          <BrainRow
            id="external"
            icon={Cable}
            label="Cérebro externo"
            hint="Seu próprio bot (Nea ou outro) pela API do CRM."
            view={externalView(status, now)}
          />
          {(status.dispatch.host !== null || status.dispatch.problem !== null) && (
            <BrainRow
              id="dispatch"
              icon={Send}
              label="Despacho ao cérebro"
              hint="O CRM repassa cada turno; o webhook não sai daqui."
              view={dispatchView(status.dispatch, now)}
            />
          )}
        </dl>

        {lastSeenAt && (
          <p className="text-[11px] text-text-3">
            A última chamada do cérebro externo é contada desde a última inicialização
            do CRM.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function embeddedView(s: BrainStatusDto): RowView {
  const { configured, enabled, answering } = s.embedded;
  const headline = `${enabled ? "Ligado" : "Desligado"} · ${
    configured ? "IA configurada" : "sem provedor de IA"
  }`;
  // Con el despacho activo no contesta, esté como esté: va antes que todo lo
  // demás para no pedir un proveedor de IA que no hace falta.
  if (s.dispatch.active) {
    return {
      tone: "off",
      headline,
      detail: enabled
        ? "Em silêncio: os turnos são repassados ao seu cérebro externo. Você pode deixá-lo desligado."
        : "Deve ficar assim enquanto seu cérebro externo responder.",
    };
  }
  if (enabled && !configured) {
    return { tone: "warn", headline, detail: "Não responde: falta o provedor de IA, ou ele está pausado (Configurações → IA)." };
  }
  if (answering) {
    return {
      tone: "ok",
      headline,
      detail:
        s.warning === "doble_respuesta"
          ? null
          : "Responde nas conversas com a IA ativada.",
    };
  }
  if (s.external.active) {
    return { tone: "off", headline, detail: "Deve ficar assim enquanto seu cérebro externo responder." };
  }
  return {
    tone: "off",
    headline,
    detail: configured
      ? "Ligue-o no botão acima para que ele responda."
      : "Para usá-lo, configure seu provedor de IA em Configurações → IA.",
  };
}

function externalView(s: BrainStatusDto, now: number): RowView {
  const { keyConfigured, lastSeenAt, active, health } = s.external;
  const llamada = lastSeenAt
    ? `última chamada ${haceCuanto(lastSeenAt, now)}`
    : "sem chamadas desde a última inicialização";

  if (health?.reachable) {
    const name = externalBrainName(s);
    const parts = [
      name,
      "online",
      health.version && versionLabel(health.version),
      health.mode && `modo ${health.mode}`,
      health.relay && relayLabel(health.relay),
    ].filter(Boolean);
    return keyConfigured
      ? { tone: "ok", headline: capitalize(parts.join(" · ")), detail: `${capitalize(llamada)}.` }
      : {
          tone: "warn",
          headline: capitalize(parts.join(" · ")),
          detail: "Falta BOT_API_KEY no CRM: ele não pode responder pela API.",
        };
  }
  if (health?.problem === "config") {
    return {
      tone: "warn",
      headline: "Não é possível consultar o status",
      detail: `BRAIN_HEALTH_URL não é uma URL http:// ou https:// válida (ex.: http://nea:8000/health): corrija e faça o deploy do CRM de novo.${
        keyConfigured ? ` ${capitalize(llamada)}.` : ""
      }`,
    };
  }
  if (health) {
    const name = externalBrainName(s);
    return {
      tone: "warn",
      headline: capitalize(`${name ? `${name} · ` : ""}não está online`),
      detail: `${health.host} ${problemLabel(health)}.${
        keyConfigured ? ` ${capitalize(llamada)}.` : ""
      }`,
    };
  }
  if (keyConfigured) {
    return { tone: active ? "ok" : "off", headline: `Chave configurada · ${llamada}`, detail: null };
  }
  return { tone: "off", headline: "Sem cérebro externo", detail: null };
}

function dispatchView(d: BrainDispatchDto, now: number): RowView {
  const mientras = "Enquanto isso, responde o agente incluído, se estiver ligado.";
  if (d.problem === "url") {
    return {
      tone: "warn",
      headline: "Não é possível despachar",
      detail: `BRAIN_DISPATCH_URL não é uma URL http:// ou https:// válida, ou contém usuário e senha (ex.: http://nea:8000/vocero/dispatch): corrija e faça o deploy do CRM de novo. ${mientras}`,
    };
  }
  if (d.problem === "sin_llave") {
    return {
      tone: "warn",
      headline: "Não é possível despachar",
      detail: `Falta BOT_API_KEY (mínimo de 16 caracteres): com ela cada turno é assinado e o cérebro responde. ${mientras}`,
    };
  }
  const espera =
    d.pending > 0
      ? ` ${d.pending === 1 ? "1 turno na fila" : `${d.pending} turnos na fila`}.`
      : "";
  if (d.lastFailure && despachoFallando(d)) {
    return {
      tone: "warn",
      headline: `Ativo · ${d.host} · o último turno não chegou`,
      detail: `${capitalize(d.lastFailure.detail)} (${haceCuanto(d.lastFailure.at, now)}). Após três tentativas com falha, a conversa fica com uma pessoa.${espera}`,
    };
  }
  return {
    tone: "ok",
    headline: `Ativo · ${d.host}`,
    detail: d.lastDeliveredAt
      ? `Último turno entregue ${haceCuanto(d.lastDeliveredAt, now)}.${espera}`
      : `Nenhum turno foi despachado ainda.${espera}`,
  };
}

function versionLabel(v: string): string {
  return /^v/i.test(v) ? v : `v${v}`;
}

function relayLabel(r: BrainRelayDto): string | null {
  if (r.pendientes === null) return null;
  const base = r.pendientes === 1 ? "1 mensagem para repassar" : `${r.pendientes} mensagens para repassar`;
  if (r.pendientes > 0 && r.masViejoSegundos !== null && r.masViejoSegundos >= 60) {
    return `${base} (a mais antiga, de ${Math.floor(r.masViejoSegundos / 60)} min atrás)`;
  }
  return base;
}

function problemLabel(h: BrainHealthDto): string {
  switch (h.problem) {
    case "timeout":
      return "não respondeu em 2 s";
    case "status":
      return `respondeu ${h.httpStatus ?? "com erro"}`;
    case "redirect":
      return "respondeu com um redirecionamento (não é seguido)";
    case "invalid":
      return "respondeu, mas não com o status";
    default:
      return "não aceita a conexão";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function BrainRow({
  id,
  icon: Icon,
  label,
  hint,
  view,
}: {
  id: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  view: RowView;
}) {
  return (
    <div
      data-brain-row={id}
      data-tone={view.tone}
      className="grid gap-1.5 p-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-4 sm:p-4"
    >
      <dt className="flex items-start gap-2.5">
        <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </dt>
      <dd className="flex min-w-0 items-start gap-2 pl-[26px] sm:pl-0">
        <span aria-hidden className={cn("mt-[7px] h-2 w-2 shrink-0 rounded-full", DOT[view.tone])} />
        <div className="min-w-0">
          <p className="break-words text-sm">{view.headline}</p>
          {view.detail && (
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{view.detail}</p>
          )}
        </div>
      </dd>
    </div>
  );
}

function Callout({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "danger" | "warning";
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md border p-3",
        tone === "danger"
          ? "border-danger-soft bg-danger-tint text-danger-text"
          : "border-warning-soft bg-warning-tint text-warning-text"
      )}
    >
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

/** El nombre de una variable, entero: partido a media palabra en el móvil no
 *  se puede copiar ni reconocer. */
function Env({ children }: { children: React.ReactNode }) {
  return <code className="whitespace-nowrap font-mono text-[0.92em]">{children}</code>;
}
