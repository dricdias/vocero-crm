"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  Users,
} from "lucide-react";
import { EvolutionConexao } from "@/components/settings/evolution-conexao";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/**
 * Agentes por área (Vendas, Financeiro…). O principal é o «Comportamento» ao
 * lado: recebe as conversas novas e passa para a área certa quando o assunto
 * é dela. A base de conhecimento é a mesma para todos.
 */

type AgenteArea = {
  id: string;
  nome: string;
  assunto: string;
  tom: string | null;
  instrucoes: string | null;
  regrasEscalonamento: string | null;
  ativo: boolean;
  /** Número próprio (Evolution Go): estado, ou null sem número. */
  numero?: "connected" | "reconnect_required" | null;
  /** Grupo (JID) ou telefone que recebe os avisos deste agente; null = o grupo geral. */
  avisoDestino: string | null;
  avisoNome: string | null;
};

type Rascunho = Omit<AgenteArea, "id" | "ativo" | "numero">;
type CampoTexto =
  "nome" | "assunto" | "tom" | "instrucoes" | "regrasEscalonamento";

/** Avisos da equipe: se estão ligados e os grupos do número principal. */
type Avisos = { ligados: boolean; grupos: { jid: string; name: string }[] };

const VAZIO: Rascunho = {
  nome: "",
  assunto: "",
  tom: "",
  instrucoes: "",
  regrasEscalonamento: "",
  avisoDestino: null,
  avisoNome: null,
};

const PESSOA = "__pessoa__";
const GRUPO_RE = /^\d+(?:-\d+)?@g\.us$/;

export function AgentesAreaSection({
  principalNome,
}: {
  principalNome: string;
}) {
  const [agentes, setAgentes] = useState<AgenteArea[] | null>(null);
  /** id em edição, "novo" para o formulário de criação, null fechado. */
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** Número próprio só existe com o Evolution Go ligado. */
  const [numerosProprios, setNumerosProprios] = useState(false);
  /** O agente com o painel «Número próprio» aberto. */
  const [numeroAberto, setNumeroAberto] = useState<string | null>(null);
  /** null = Evolution Go desligado: não há avisos pelo WhatsApp. */
  const [avisos, setAvisos] = useState<Avisos | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/agentes")
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    setAgentes(r?.agentes ?? []);
    setNumerosProprios(Boolean(r?.numerosProprios));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Os grupos saem do número principal, o mesmo que manda os avisos.
  useEffect(() => {
    if (!numerosProprios) return;
    void fetch("/api/settings/team-alerts")
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null)
      .then((d) =>
        setAvisos({
          ligados: Boolean(d?.settings?.enabled),
          grupos: (d?.groups ?? []) as Avisos["grupos"],
        }),
      );
  }, [numerosProprios]);

  async function salvar(
    id: string | null,
    dados: Partial<AgenteArea>,
  ): Promise<boolean> {
    setErro(null);
    const res = await fetch(id ? `/api/agentes/${id}` : "/api/agentes", {
      method: id ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(dados),
    }).catch(() => null);
    if (!res?.ok) {
      const corpo = await res?.json().catch(() => null);
      setErro(
        corpo?.error?.message ??
          corpo?.message ??
          "Não foi possível salvar. Tente de novo.",
      );
      return false;
    }
    await carregar();
    return true;
  }

  async function apagar(a: AgenteArea) {
    if (
      !window.confirm(
        `Apagar o agente ${a.nome}? As conversas dele voltam para ${principalNome}.` +
          (a.numero ? " O número próprio dele será desvinculado do CRM." : ""),
      )
    ) {
      return;
    }
    setErro(null);
    const res = await fetch(`/api/agentes/${a.id}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (!res?.ok) setErro("Não foi possível apagar. Tente de novo.");
    await carregar();
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Agentes por área</CardTitle>
            <CardDescription>
              {principalNome} recebe as conversas novas. Quando o assunto é de
              uma área (vendas, financeiro…), ele passa a conversa para o agente
              dela, no mesmo número, e esse agente responde na hora. Todos usam
              a mesma base de conhecimento.
              {numerosProprios &&
                " Um agente também pode ter um WhatsApp próprio: quem escreve nesse número já cai com ele."}
            </CardDescription>
          </div>
          {editando !== "novo" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditando("novo")}
            >
              <Plus className="mr-1 h-4 w-4" />
              Novo agente
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {editando === "novo" && (
          <FormAgente
            inicial={VAZIO}
            avisos={avisos}
            onCancelar={() => setEditando(null)}
            onSalvar={async (d) => {
              if (await salvar(null, d)) setEditando(null);
            }}
          />
        )}

        {agentes === null ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : agentes.length === 0 && editando !== "novo" ? (
          <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 h-6 w-6" strokeWidth={1.7} />
            Nenhum agente de área ainda. Hoje {principalNome} atende tudo
            sozinho.
          </div>
        ) : (
          agentes.map((a) =>
            editando === a.id ? (
              <FormAgente
                key={a.id}
                inicial={{
                  nome: a.nome,
                  assunto: a.assunto,
                  tom: a.tom ?? "",
                  instrucoes: a.instrucoes ?? "",
                  regrasEscalonamento: a.regrasEscalonamento ?? "",
                  avisoDestino: a.avisoDestino,
                  avisoNome: a.avisoNome,
                }}
                avisos={avisos}
                onCancelar={() => setEditando(null)}
                onSalvar={async (d) => {
                  if (await salvar(a.id, d)) setEditando(null);
                }}
              />
            ) : (
              <div key={a.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {a.nome}
                      {!a.ativo && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          desligado
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{a.assunto}</p>
                    {a.numero && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Smartphone className="h-3.5 w-3.5" />
                        Número próprio ·{" "}
                        {a.numero === "connected"
                          ? "conectado"
                          : "aguardando o telefone"}
                      </p>
                    )}
                    {a.avisoDestino && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <BellRing className="h-3.5 w-3.5" />
                        Avisos para {a.avisoNome ?? a.avisoDestino}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={a.ativo}
                      label={`Agente ${a.nome} ligado`}
                      onCheckedChange={(ativo) => void salvar(a.id, { ativo })}
                    />
                    {numerosProprios && (
                      <Button
                        size="icon"
                        variant={numeroAberto === a.id ? "secondary" : "ghost"}
                        aria-label={`Número próprio de ${a.nome}`}
                        aria-expanded={numeroAberto === a.id}
                        onClick={() =>
                          setNumeroAberto(numeroAberto === a.id ? null : a.id)
                        }
                      >
                        <Smartphone className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Editar ${a.nome}`}
                      onClick={() => setEditando(a.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Apagar ${a.nome}`}
                      onClick={() => void apagar(a)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {numeroAberto === a.id && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    <p className="text-sm text-muted-foreground">
                      Crie uma instância nova no Evolution Go para o número de{" "}
                      {a.nome} e cole aqui o token dela. Quem escrever nesse
                      número cai direto com {a.nome}, e as respostas saem por
                      ele.
                    </p>
                    <EvolutionConexao
                      endpoint={`/api/agentes/${a.id}/whatsapp`}
                      onChange={carregar}
                    />
                  </div>
                )}
              </div>
            ),
          )
        )}
      </CardContent>
    </Card>
  );
}

function FormAgente({
  inicial,
  avisos,
  onSalvar,
  onCancelar,
}: {
  inicial: Rascunho;
  avisos: Avisos | null;
  onSalvar: (d: Rascunho) => Promise<void>;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  // "" = grupo geral, um JID = grupo, PESSOA = telefone digitado.
  const [modoAviso, setModoAviso] = useState(
    !inicial.avisoDestino
      ? ""
      : GRUPO_RE.test(inicial.avisoDestino)
        ? inicial.avisoDestino
        : PESSOA,
  );
  const [telefone, setTelefone] = useState(
    inicial.avisoDestino && !GRUPO_RE.test(inicial.avisoDestino)
      ? inicial.avisoDestino
      : "",
  );
  const digitos = telefone.replace(/\D/g, "");
  const telefoneInvalido =
    modoAviso === PESSOA && (digitos.length < 10 || digitos.length > 15);
  // O grupo salvo pode ter saído da lista (o número saiu dele): continua visível.
  const grupos =
    avisos &&
    modoAviso &&
    modoAviso !== PESSOA &&
    !avisos.grupos.some((g) => g.jid === modoAviso)
      ? [
          { jid: modoAviso, name: inicial.avisoNome ?? modoAviso },
          ...avisos.grupos,
        ]
      : (avisos?.grupos ?? []);

  function comAviso(d: Rascunho): Rascunho {
    if (!avisos) return d;
    if (!modoAviso) return { ...d, avisoDestino: null, avisoNome: null };
    if (modoAviso === PESSOA)
      return { ...d, avisoDestino: digitos, avisoNome: `+${digitos}` };
    return {
      ...d,
      avisoDestino: modoAviso,
      avisoNome: grupos.find((g) => g.jid === modoAviso)?.name ?? null,
    };
  }

  const campo = (k: CampoTexto) => ({
    value: form[k] ?? "",
    onChange: (e: { target: { value: string } }) =>
      setForm({ ...form, [k]: e.target.value }),
  });

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ag-nome">Nome</Label>
          <Input
            id="ag-nome"
            placeholder="ex.: Financeiro"
            {...campo("nome")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ag-tom">Tom (opcional)</Label>
          <Input
            id="ag-tom"
            placeholder="Vazio = o mesmo do principal"
            {...campo("tom")}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ag-assunto">O que este agente atende</Label>
        <Input
          id="ag-assunto"
          placeholder="ex.: boletos, segunda via, pagamentos, reembolsos"
          {...campo("assunto")}
        />
        <p className="text-[12px] text-text-3">
          É isso que os outros agentes leem para decidir passar a conversa para
          ele. Seja específico.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ag-instrucoes">Instruções da área</Label>
        <Textarea
          id="ag-instrucoes"
          rows={4}
          placeholder="Somam às instruções gerais do principal."
          {...campo("instrucoes")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ag-escalonamento">
          Regras de escalonamento (opcional)
        </Label>
        <Textarea
          id="ag-escalonamento"
          rows={2}
          placeholder="Vazio = as mesmas do principal"
          {...campo("regrasEscalonamento")}
        />
      </div>
      {avisos && (
        <div className="space-y-1.5">
          <Label htmlFor="ag-aviso">Avisos de atendimento humano</Label>
          <select
            id="ag-aviso"
            value={modoAviso}
            onChange={(e) => setModoAviso(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Grupo geral da equipe</option>
            {grupos.map((g) => (
              <option key={g.jid} value={g.jid}>
                Grupo: {g.name}
              </option>
            ))}
            <option value={PESSOA}>Uma pessoa (WhatsApp)</option>
          </select>
          {modoAviso === PESSOA && (
            <Input
              aria-label="Telefone de quem recebe os avisos"
              placeholder="Com DDI e DDD, ex.: 5511999990000"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          )}
          <p className="text-[12px] text-text-3">
            {avisos.ligados
              ? "Quando este agente passar a conversa para uma pessoa, o aviso e o lembrete vão para cá, pelo número principal."
              : "Os avisos só saem com os avisos da equipe ligados em Configurações → WhatsApp."}
          </p>
          {telefoneInvalido && (
            <p className="text-[12px] text-destructive">
              Digite o telefone com DDI e DDD (10 a 15 dígitos).
            </p>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={
            salvando ||
            !form.nome.trim() ||
            !form.assunto.trim() ||
            telefoneInvalido
          }
          onClick={async () => {
            setSalvando(true);
            try {
              await onSalvar(comAviso(form));
            } finally {
              setSalvando(false);
            }
          }}
        >
          {salvando ? "Salvando…" : "Salvar agente"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
