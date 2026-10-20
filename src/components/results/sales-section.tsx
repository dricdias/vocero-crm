"use client";

import type { SalesBlockDto } from "@/lib/analytics";
import { formatMoneyCents } from "@/lib/money";
import { Funnel } from "./funnel";
import { Section, Subhead } from "./section";
import { RateCard, StatCard } from "./stat-card";
import { TimeBars } from "./time-bars";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** 019 — Ventas: los indicadores, la serie, el embudo y las pérdidas. */
export function SalesSection({
  data,
  loading,
  error,
  currency,
}: {
  data: SalesBlockDto | null;
  loading: boolean;
  error: string | null;
  currency: string;
}) {
  const money = (c: number | null) => formatMoneyCents(c, currency) ?? "—";
  return (
    <Section
      id="ventas"
      title="Vendas"
      hint="O que entrou, o que fechou e onde os negócios travam."
      loading={loading}
      error={error}
      hasData={!!data}
      empty={!!data?.empty}
      emptyText="Não há prospects nem fechamentos neste período. Tente um intervalo maior."
    >
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Prospects novos"
              value={String(data.kpis.newLeads.current)}
              compare={data.kpis.newLeads}
            />
            <StatCard
              label="Negócios ganhos"
              value={String(data.kpis.won.current)}
              compare={data.kpis.won}
            />
            <StatCard
              label="Dinheiro ganho"
              value={money(data.kpis.wonCents.current)}
              compare={data.kpis.wonCents}
            />
            <StatCard
              label="Negócios perdidos"
              value={String(data.kpis.lost.current)}
              compare={data.kpis.lost}
              inverted
            />
            <RateCard
              label="Taxa de fechamento"
              rate={data.kpis.winRate}
              unit="negócios fechados"
            />
            <StatCard
              label="Ticket médio"
              value={money(data.kpis.avgTicketCents)}
              hint={
                data.kpis.avgTicketCents === null
                  ? "nenhum negócio ganho com valor"
                  : undefined
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TimeBars
              title="Prospects novos"
              unit="prospects"
              points={data.series.map((s) => ({ bucket: s.bucket, value: s.newLeads }))}
              format={(v) => String(v)}
            />
            <TimeBars
              title="Negócios ganhos"
              unit="negócios ganhos"
              points={data.series.map((s) => ({
                bucket: s.bucket,
                value: s.won,
                detail: s.wonCents > 0 ? money(s.wonCents) : undefined,
              }))}
              format={(v) => String(v)}
              emptyText="Nenhum negócio ganho no período."
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <Subhead>Funil dos que entraram neste período</Subhead>
              <Funnel steps={data.funnel} />
            </div>

            <div className="space-y-6">
              <div>
                <Subhead>Onde travam</Subhead>
                {data.timing.length === 0 ? (
                  <p className="text-sm text-text-3">
                    Ainda não há movimentações suficientes para medir tempos.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sr-only">
                      <tr>
                        <th scope="col">Etapa</th>
                        <th scope="col">Dias em média</th>
                        <th scope="col">Movimentações medidas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.timing.map((t) => (
                        <tr key={t.stageId ?? t.name} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">{t.name}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {t.avgDays ?? "—"} dias
                          </td>
                          <td className="w-24 py-1.5 text-right text-xs text-text-3 tabular-nums">
                            {t.sample} mov.
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {data.timeToWinDays !== null && (
                  <p className="mt-2 text-xs text-text-3">
                    Do primeiro contato ao fechamento:{" "}
                    <strong className="font-semibold text-foreground">
                      {data.timeToWinDays} dias
                    </strong>{" "}
                    en promedio.
                  </p>
                )}
              </div>

              <div>
                <Subhead>Por que foram perdidos</Subhead>
                {data.lossReasons.length === 0 ? (
                  <p className="text-sm text-text-3">Nenhum negócio perdido neste período.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sr-only">
                      <tr>
                        <th scope="col">Motivo</th>
                        <th scope="col">Tratos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lossReasons.map((r) => (
                        <tr key={r.reason} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">{r.label}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div>
            <Subhead>Hoje no funil</Subhead>
            <p className="-mt-1 mb-2 text-xs text-text-3">
              Não depende do período: são os negócios abertos neste momento.
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:max-w-xl">
              <StatCard label="Dinheiro em negócios abertos" value={money(data.pipeline.openCents)} />
              <StatCard
                label="Negócios sem valor"
                value={String(data.pipeline.withoutAmount)}
                hint={data.pipeline.withoutAmount > 0 ? "não somam ao dinheiro aberto" : undefined}
              />
            </div>
            {data.pipeline.otherCurrency > 0 && (
              <p className="mt-3 rounded-md border border-warning-soft bg-warning-tint px-3 py-2 text-xs text-warning-text">
                {plural(data.pipeline.otherCurrency, "negócio", "negócios")} com valor em outra
                moeda não {data.pipeline.otherCurrency === 1 ? "entra" : "entram"} nos
                totais: misturar moedas daria uma soma falsa.
              </p>
            )}
          </div>

          {data.completeFrom && (
            <p className="text-[11px] text-text-3">
              Os tempos usam movimentações registradas desde{" "}
              {new Date(data.completeFrom).toLocaleDateString("pt-BR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              . O que veio antes foi gerado ao instalar o histórico de etapas e não é usado para
              medir durações.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
