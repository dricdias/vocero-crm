"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
};

type Rascunho = Omit<AgenteArea, "id" | "ativo">;

const VAZIO: Rascunho = {
  nome: "",
  assunto: "",
  tom: "",
  instrucoes: "",
  regrasEscalonamento: "",
};

export function AgentesAreaSection({ principalNome }: { principalNome: string }) {
  const [agentes, setAgentes] = useState<AgenteArea[] | null>(null);
  /** id em edição, "novo" para o formulário de criação, null fechado. */
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/agentes")
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    setAgentes(r?.agentes ?? []);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(id: string | null, dados: Partial<AgenteArea>): Promise<boolean> {
    setErro(null);
    const res = await fetch(id ? `/api/agentes/${id}` : "/api/agentes", {
      method: id ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(dados),
    }).catch(() => null);
    if (!res?.ok) {
      const corpo = await res?.json().catch(() => null);
      setErro(corpo?.error?.message ?? corpo?.message ?? "Não foi possível salvar. Tente de novo.");
      return false;
    }
    await carregar();
    return true;
  }

  async function apagar(a: AgenteArea) {
    if (
      !window.confirm(
        `Apagar o agente ${a.nome}? As conversas dele voltam para ${principalNome}.`
      )
    ) {
      return;
    }
    setErro(null);
    const res = await fetch(`/api/agentes/${a.id}`, { method: "DELETE" }).catch(() => null);
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
              {principalNome} recebe as conversas novas. Quando o assunto é de uma área (vendas,
              financeiro…), ele passa a conversa para o agente dela, no mesmo número, e esse
              agente responde na hora. Todos usam a mesma base de conhecimento.
            </CardDescription>
          </div>
          {editando !== "novo" && (
            <Button size="sm" variant="outline" onClick={() => setEditando("novo")}>
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
            Nenhum agente de área ainda. Hoje {principalNome} atende tudo sozinho.
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
                }}
                onCancelar={() => setEditando(null)}
                onSalvar={async (d) => {
                  if (await salvar(a.id, d)) setEditando(null);
                }}
              />
            ) : (
              <div
                key={a.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
              >
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
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={a.ativo}
                    label={`Agente ${a.nome} ligado`}
                    onCheckedChange={(ativo) => void salvar(a.id, { ativo })}
                  />
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
            )
          )
        )}
      </CardContent>
    </Card>
  );
}

function FormAgente({
  inicial,
  onSalvar,
  onCancelar,
}: {
  inicial: Rascunho;
  onSalvar: (d: Rascunho) => Promise<void>;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const campo = (k: keyof Rascunho) => ({
    value: form[k] ?? "",
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }),
  });

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ag-nome">Nome</Label>
          <Input id="ag-nome" placeholder="ex.: Financeiro" {...campo("nome")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ag-tom">Tom (opcional)</Label>
          <Input id="ag-tom" placeholder="Vazio = o mesmo do principal" {...campo("tom")} />
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
          É isso que os outros agentes leem para decidir passar a conversa para ele. Seja
          específico.
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
        <Label htmlFor="ag-escalonamento">Regras de escalonamento (opcional)</Label>
        <Textarea
          id="ag-escalonamento"
          rows={2}
          placeholder="Vazio = as mesmas do principal"
          {...campo("regrasEscalonamento")}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={salvando || !form.nome.trim() || !form.assunto.trim()}
          onClick={async () => {
            setSalvando(true);
            try {
              await onSalvar(form);
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
