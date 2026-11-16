import { and, desc, eq, gte, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { HANDOFF_LABELS } from "@/lib/eventos-hilo";
import { evolutionRequest, type EvolutionAccess } from "./client";
import { getEvolutionByOrg } from "./credentials";
import { evolutionEnabled } from "./flag";

/**
 * Avisos da equipe pelo WhatsApp (Evolution Go).
 *
 * Quando a IA passa uma conversa para uma pessoa, o grupo da equipe recebe um
 * aviso; se o cliente fica sem resposta humana por N minutos, recebe um
 * lembrete. Um barrido em segundo plano decide o que avisar a partir do
 * próprio banco (`handoff_at`, `last_inbound_at` e as mensagens), então cobre
 * todos os caminhos de traspaso e sobrevive a reinícios sem fila externa.
 *
 * Nunca bloqueia o atendimento: se o envio falha, o aviso é liberado e o
 * próximo barrido tenta de novo.
 */

export const GROUP_JID_RE = /^\d+(?:-\d+)?@g\.us$/;
export const REMINDER_MIN = 5;
export const REMINDER_MAX = 240;
export const DEFAULT_REMINDER_MINUTES = 15;

/** Barrido a cada 30 s: o aviso chega em até meio minuto. */
const SWEEP_MS = 30_000;
/** Depois de uma queda longa, não despeja avisos velhos no grupo. */
const HANDOFF_WINDOW_MS = 2 * 60 * 60_000;
const REMINDER_WINDOW_MS = 12 * 60 * 60_000;
const PER_SWEEP = 20;
const EXCERPT_MAX = 160;

export type TeamAlertSettings = {
  enabled: boolean;
  groupJid: string | null;
  groupName: string | null;
  reminderMinutes: number;
};

export async function getTeamAlertSettings(organizationId: string): Promise<TeamAlertSettings> {
  const [row] = await getDb()
    .select()
    .from(schema.teamAlertSettings)
    .where(scoped(schema.teamAlertSettings.organizationId, organizationId))
    .limit(1);
  return {
    enabled: row?.enabled ?? false,
    groupJid: row?.groupJid ?? null,
    groupName: row?.groupName ?? null,
    reminderMinutes: row?.reminderMinutes ?? DEFAULT_REMINDER_MINUTES,
  };
}

export async function saveTeamAlertSettings(organizationId: string, input: TeamAlertSettings): Promise<void> {
  const before = await getTeamAlertSettings(organizationId);
  const now = new Date();
  // Ligar ou trocar de grupo recomeça a contagem: só avisa o que vier depois.
  const restart = input.enabled && (!before.enabled || before.groupJid !== input.groupJid);
  const values = {
    enabled: input.enabled,
    groupJid: input.groupJid,
    groupName: input.groupName,
    reminderMinutes: input.reminderMinutes,
    updatedAt: now,
    ...(restart ? { enabledAt: now } : {}),
  };
  await getDb()
    .insert(schema.teamAlertSettings)
    .values({ organizationId, ...values, enabledAt: input.enabled ? now : null })
    .onConflictDoUpdate({ target: schema.teamAlertSettings.organizationId, set: values });
}

const groupListSchema = z.array(
  z.object({ JID: z.string(), Name: z.string().optional().nullable() }).passthrough(),
);

export type TeamGroup = { jid: string; name: string };

/** Grupos de que o número conectado participa, para escolher o da equipe. */
export async function listTeamGroups(access: EvolutionAccess): Promise<TeamGroup[]> {
  const groups = await evolutionRequest(access, "/group/list", groupListSchema.nullable());
  return (groups ?? [])
    .filter((g) => GROUP_JID_RE.test(g.JID))
    .map((g) => ({ jid: g.JID, name: g.Name?.trim() || g.JID }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

const sentSchema = z.object({ Info: z.object({ ID: z.string().min(1) }) });

/** Texto para um grupo: `formatJid: false` para o gateway não tratar o JID como telefone. */
export async function sendTeamGroupText(access: EvolutionAccess, groupJid: string, text: string): Promise<void> {
  if (!GROUP_JID_RE.test(groupJid)) throw new Error("JID de grupo inválido");
  await evolutionRequest(access, "/send/text", sentSchema, { number: groupJid, text, formatJid: false });
}

/* ------------------------------------------------------------------ */
/* Textos                                                              */
/* ------------------------------------------------------------------ */

export function excerpt(text: string | null | undefined): string | null {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > EXCERPT_MAX ? `${clean.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : clean;
}

function who(contact: { name: string; phone: string | null }): string {
  const name = contact.name.trim() || "Cliente sem nome";
  return contact.phone ? `${name} (${contact.phone})` : name;
}

export function conversationLink(baseUrl: string, conversationId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/inbox?conversation=${encodeURIComponent(conversationId)}`;
}

export function handoffAlertText(input: {
  contact: { name: string; phone: string | null };
  reason: string | null;
  lastMessage: string | null;
  link: string;
}): string {
  const lines = [
    "🙋 *Atendimento humano*",
    `Cliente: ${who(input.contact)}`,
    `Motivo: ${(input.reason && HANDOFF_LABELS[input.reason]) || "A IA pausou"}`,
  ];
  const last = excerpt(input.lastMessage);
  if (last) lines.push(`Última mensagem: "${last}"`);
  lines.push(`Responder: ${input.link}`);
  return lines.join("\n");
}

export function reminderText(input: {
  contact: { name: string; phone: string | null };
  minutes: number;
  lastMessage: string | null;
  link: string;
}): string {
  const lines = [
    `⏰ *Sem resposta há ${input.minutes} min*`,
    `Cliente: ${who(input.contact)}`,
  ];
  const last = excerpt(input.lastMessage);
  if (last) lines.push(`Última mensagem: "${last}"`);
  lines.push(`Responder: ${input.link}`);
  return lines.join("\n");
}

export const TEST_TEXT =
  "✅ Teste do CRM: os avisos de atendimento humano e os lembretes de cliente sem resposta vão chegar neste grupo.";

/* ------------------------------------------------------------------ */
/* Barrido                                                             */
/* ------------------------------------------------------------------ */

type ActiveOrg = { organizationId: string; groupJid: string; reminderMinutes: number; enabledAt: Date };

async function activeOrgs(): Promise<ActiveOrg[]> {
  const rows = await getDb()
    .select()
    .from(schema.teamAlertSettings)
    .where(
      and(
        eq(schema.teamAlertSettings.enabled, true),
        isNotNull(schema.teamAlertSettings.groupJid),
        isNotNull(schema.teamAlertSettings.enabledAt),
      ),
    );
  return rows.flatMap((r) =>
    r.groupJid && r.enabledAt && GROUP_JID_RE.test(r.groupJid)
      ? [{ organizationId: r.organizationId, groupJid: r.groupJid, reminderMinutes: r.reminderMinutes, enabledAt: r.enabledAt }]
      : [],
  );
}

async function lastInboundText(organizationId: string, conversationId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ text: schema.message.text, type: schema.message.type })
    .from(schema.message)
    .where(
      scoped(
        schema.message.organizationId,
        organizationId,
        eq(schema.message.conversationId, conversationId),
        eq(schema.message.direction, "in"),
      ),
    )
    .orderBy(desc(schema.message.createdAt))
    .limit(1);
  if (!row) return null;
  return row.text ?? (row.type !== "text" ? `[${row.type}]` : null);
}

/**
 * «Ainda não avisado»: o valor guardado veio de um `Date` do JS (milissegundos);
 * o da conversa pode ter microssegundos se alguém o escreveu com `now()`.
 * Sem truncar, os dois nunca seriam iguais e o aviso se repetiria a cada barrido.
 */
function notYet(saved: PgColumn, current: PgColumn): SQL {
  return sql`${saved} is distinct from date_trunc('milliseconds', ${current})`;
}

/**
 * Reserva o aviso ANTES de enviar (insert/update condicional): dois processos
 * no meio de um deploy não mandam o mesmo aviso duas vezes. Devolve false se
 * outro já reservou.
 */
async function claim(
  organizationId: string,
  conversationId: string,
  field: "alertedHandoffAt" | "remindedInboundAt",
  value: Date,
): Promise<boolean> {
  const column = schema.teamAlertState[field];
  const rows = await getDb()
    .insert(schema.teamAlertState)
    .values({ conversationId, organizationId, [field]: value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.teamAlertState.conversationId,
      set: { [field]: value, updatedAt: new Date() },
      setWhere: or(isNull(column), ne(column, value)),
    })
    .returning({ id: schema.teamAlertState.conversationId });
  return rows.length > 0;
}

async function release(
  conversationId: string,
  field: "alertedHandoffAt" | "remindedInboundAt",
  previous: Date | null,
): Promise<void> {
  await getDb()
    .update(schema.teamAlertState)
    .set({ [field]: previous, updatedAt: new Date() })
    .where(eq(schema.teamAlertState.conversationId, conversationId));
}

async function sweepHandoffs(org: ActiveOrg, access: EvolutionAccess, baseUrl: string, now: Date): Promise<void> {
  const c = schema.conversation;
  const st = schema.teamAlertState;
  const since = new Date(Math.max(org.enabledAt.getTime(), now.getTime() - HANDOFF_WINDOW_MS));
  const rows = await getDb()
    .select({
      id: c.id,
      handoffAt: c.handoffAt,
      reason: c.handoffReason,
      name: schema.contact.name,
      phone: schema.contact.phone,
      identity: schema.contact.waIdentity,
      alerted: st.alertedHandoffAt,
    })
    .from(c)
    .innerJoin(schema.contact, eq(schema.contact.id, c.contactId))
    .leftJoin(st, eq(st.conversationId, c.id))
    .where(
      scoped(
        c.organizationId,
        org.organizationId,
        eq(c.isTest, false),
        isNotNull(c.handoffAt),
        gte(c.handoffAt, since),
        // Quem respondeu pelo celular já está atendendo: não precisa de aviso.
        sql`${c.handoffReason} is distinct from 'manual_reply'`,
        notYet(st.alertedHandoffAt, c.handoffAt),
      ),
    )
    .limit(PER_SWEEP);
  for (const row of rows) {
    if (!row.handoffAt || isTeamGroupIdentity(row.identity, org.groupJid)) continue;
    if (!(await claim(org.organizationId, row.id, "alertedHandoffAt", row.handoffAt))) continue;
    try {
      const text = handoffAlertText({
        contact: { name: row.name, phone: row.phone },
        reason: row.reason,
        lastMessage: await lastInboundText(org.organizationId, row.id),
        link: conversationLink(baseUrl, row.id),
      });
      await sendTeamGroupText(access, org.groupJid, text);
    } catch (err) {
      await release(row.id, "alertedHandoffAt", row.alerted);
      throw err;
    }
  }
}

async function sweepReminders(org: ActiveOrg, access: EvolutionAccess, baseUrl: string, now: Date): Promise<void> {
  const c = schema.conversation;
  const st = schema.teamAlertState;
  const m = schema.message;
  const dueBefore = new Date(now.getTime() - org.reminderMinutes * 60_000);
  const since = new Date(Math.max(org.enabledAt.getTime(), now.getTime() - REMINDER_WINDOW_MS));
  const rows = await getDb()
    .select({
      id: c.id,
      lastInboundAt: c.lastInboundAt,
      name: schema.contact.name,
      phone: schema.contact.phone,
      identity: schema.contact.waIdentity,
      reminded: st.remindedInboundAt,
    })
    .from(c)
    .innerJoin(schema.contact, eq(schema.contact.id, c.contactId))
    .leftJoin(st, eq(st.conversationId, c.id))
    .where(
      scoped(
        c.organizationId,
        org.organizationId,
        eq(c.isTest, false),
        isNotNull(c.handoffAt),
        isNotNull(c.lastInboundAt),
        gte(c.lastInboundAt, since),
        lte(c.lastInboundAt, dueBefore),
        notYet(st.remindedInboundAt, c.lastInboundAt),
        // Resposta de uma pessoa (CRM, celular ou modelo) depois da última
        // mensagem do cliente. A da IA não conta: o «vou te transferir» sai
        // logo depois do pedido e não é atendimento.
        sql`not exists (select 1 from ${m} where ${m.conversationId} = ${c.id} and ${m.direction} = 'out' and ${m.origin} <> 'ai' and ${m.createdAt} >= ${c.lastInboundAt})`,
      ),
    )
    .limit(PER_SWEEP);
  for (const row of rows) {
    if (!row.lastInboundAt || isTeamGroupIdentity(row.identity, org.groupJid)) continue;
    if (!(await claim(org.organizationId, row.id, "remindedInboundAt", row.lastInboundAt))) continue;
    try {
      const minutes = Math.max(org.reminderMinutes, Math.floor((now.getTime() - row.lastInboundAt.getTime()) / 60_000));
      const text = reminderText({
        contact: { name: row.name, phone: row.phone },
        minutes,
        lastMessage: await lastInboundText(org.organizationId, row.id),
        link: conversationLink(baseUrl, row.id),
      });
      await sendTeamGroupText(access, org.groupJid, text);
    } catch (err) {
      await release(row.id, "remindedInboundAt", row.reminded);
      throw err;
    }
  }
}

/** As conversas abertas DENTRO do grupo da equipe nunca geram aviso para ele mesmo. */
export function isTeamGroupIdentity(identity: string, groupJid: string): boolean {
  return identity.startsWith(`evo-group:${groupJid}:`);
}

export async function sweepTeamAlerts(now = new Date()): Promise<void> {
  if (!evolutionEnabled()) return;
  const baseUrl = getEnv().APP_BASE_URL;
  for (const org of await activeOrgs()) {
    try {
      const creds = await getEvolutionByOrg(org.organizationId);
      if (!creds) continue;
      const access = { baseUrl: creds.baseUrl, token: creds.token };
      await sweepHandoffs(org, access, baseUrl, now);
      await sweepReminders(org, access, baseUrl, now);
    } catch (err) {
      // Um WhatsApp desconectado não pode derrubar o barrido das outras orgs.
      console.error(
        `[avisos-equipe] org ${org.organizationId}: ${err instanceof Error ? err.message : "erro desconhecido"}`,
      );
    }
  }
}

type SweepState = { timer: NodeJS.Timeout | null; running: boolean };
const globalForAlerts = globalThis as unknown as { __voceroTeamAlerts?: SweepState };

export function startTeamAlerts(): void {
  if (!evolutionEnabled()) return;
  const state = (globalForAlerts.__voceroTeamAlerts ??= { timer: null, running: false });
  if (state.timer) return;
  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      await sweepTeamAlerts();
    } catch (err) {
      console.error("[avisos-equipe] barrido falhou:", err instanceof Error ? err.message : err);
    } finally {
      state.running = false;
    }
  };
  state.timer = setInterval(() => void tick(), SWEEP_MS);
  state.timer.unref?.();
  void tick();
}
