"use client";

import { useEffect, useId, useState } from "react";

/**
 * Agentes por área — quem atende esta conversa, e a equipe pode trocar.
 * Só aparece quando existe pelo menos um agente de área ligado: com o
 * principal sozinho, não há o que escolher.
 */

type Opcao = { id: string | null; nome: string; principal: boolean };
type Estado = { atual: { id: string | null; nome: string }; opcoes: Opcao[] };

/** O `<select>` não guarda null: o principal vira esta chave. */
const PRINCIPAL = "__principal__";

export function AgenteDaConversa({
  conversationId,
  refreshKey,
}: {
  conversationId: string;
  refreshKey?: unknown;
}) {
  const id = useId();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void fetch(`/api/conversations/${conversationId}/agente`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((e: Estado | null) => {
        if (vivo) setEstado(e);
      });
    return () => {
      vivo = false;
    };
  }, [conversationId, refreshKey]);

  if (!estado || estado.opcoes.length < 2) return null;

  async function trocar(valor: string) {
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/agente`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agenteId: valor === PRINCIPAL ? null : valor }),
      });
      if (!res.ok) throw new Error();
      setEstado(await res.json());
    } catch {
      setErro("Não foi possível trocar o agente. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mt-4 space-y-1.5 border-t pt-4">
      <label htmlFor={id} className="text-[12px] font-medium text-text-2">
        Atendida pelo agente
      </label>
      <select
        id={id}
        disabled={salvando}
        value={estado.atual.id ?? PRINCIPAL}
        onChange={(e) => void trocar(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {estado.opcoes.map((o) => (
          <option key={o.id ?? PRINCIPAL} value={o.id ?? PRINCIPAL}>
            {o.nome}
            {o.principal ? " (principal)" : ""}
          </option>
        ))}
      </select>
      {erro && <p className="text-[11px] text-destructive">{erro}</p>}
    </div>
  );
}
