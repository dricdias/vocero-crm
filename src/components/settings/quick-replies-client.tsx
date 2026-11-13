"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  normalizarAtajo,
  TEXTO_MAX,
  type RespuestaRapida,
} from "@/lib/respuestas-rapidas";

/**
 * 049 — Ajustes → Respuestas rápidas. Las crea y edita quien configura; las
 * usa todo el equipo escribiendo `/atajo` en el compositor de la Bandeja.
 */
export function QuickRepliesClient() {
  const [lista, setLista] = useState<RespuestaRapida[] | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  // `null` = cerrado; `""` = creando una nueva; un id = editando esa.
  const [editando, setEditando] = useState<string | null>(null);
  const [atajo, setAtajo] = useState("");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/quick-replies").catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as { respuestas: RespuestaRapida[]; puedeEditar: boolean };
    setLista(d.respuestas);
    setPuedeEditar(d.puedeEditar);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrir(r: RespuestaRapida | null) {
    setEditando(r?.id ?? "");
    setAtajo(r?.atajo ?? "");
    setTexto(r?.texto ?? "");
    setError(null);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const nueva = editando === "";
    const res = await fetch(nueva ? "/api/quick-replies" : `/api/quick-replies/${editando}`, {
      method: nueva ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ atajo, texto }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const d = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(d?.error?.message ?? "Não foi possível salvar. Verifique a conexão.");
      return;
    }
    setEditando(null);
    void cargar();
  }

  async function borrar(r: RespuestaRapida) {
    if (!window.confirm(`Apagar a resposta /${r.atajo}?`)) return;
    const res = await fetch(`/api/quick-replies/${r.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) void cargar();
  }

  const atajoFinal = normalizarAtajo(atajo);

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Respostas rápidas</CardTitle>
          <CardDescription>
            O que você escreve trinta vezes por dia. Na Caixa de entrada, digite{" "}
            <span className="font-mono">/</span> e o atalho (por exemplo{" "}
            <span className="font-mono">/horario</span>) e escolha a resposta: ela
            vai para a caixa e você revisa antes de enviar.{" "}
            <span className="font-mono">{"{nombre}"}</span> vira o primeiro
            nome do cliente. Só dentro da janela de 24 h: para reabri-la
            existem os templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lista === null ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : lista.length === 0 && editando === null ? (
            <p className="text-sm text-text-2">Ainda não há respostas rápidas.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {lista.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] font-semibold">/{r.atajo}</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-text-2">{r.texto}</p>
                  </div>
                  {puedeEditar && (
                    <span className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Editar /${r.atajo}`} onClick={() => abrir(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Apagar /${r.atajo}`} onClick={() => void borrar(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {puedeEditar && editando === null && (
            <Button variant="outline" size="sm" onClick={() => abrir(null)}>
              <Plus className="h-4 w-4" /> Nova resposta
            </Button>
          )}

          {editando !== null && (
            <div className="space-y-3 rounded-md border bg-subtle p-3" data-testid="form-respuesta">
              <div className="space-y-1.5">
                <Label htmlFor="qr-atajo">Atalho</Label>
                <Input
                  id="qr-atajo"
                  value={atajo}
                  onChange={(e) => setAtajo(e.target.value)}
                  placeholder="horario"
                  maxLength={40}
                  autoFocus
                />
                <p className="text-xs text-text-3">
                  Escreve-se como <span className="font-mono">/{atajoFinal || "atalho"}</span>: letras,
                  números, - ou _, sem espaços.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qr-texto">Texto</Label>
                <Textarea
                  id="qr-texto"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={4}
                  maxLength={TEXTO_MAX}
                  placeholder="Abrimos de segunda a sábado, das 8h às 19h."
                />
              </div>
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={guardando || !atajoFinal || !texto.trim()} onClick={() => void guardar()}>
                  {guardando ? "Salvando…" : "Salvar"}
                </Button>
                <Button size="sm" variant="outline" disabled={guardando} onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
