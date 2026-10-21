"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { evolutionGroupModeSchema, type EvolutionGroupMode } from "@/lib/evolution-group-mode";

type GroupState = { mode: EvolutionGroupMode; available: boolean; canConfigure: boolean };
export function GroupModeControl({ conversationId, refreshKey = 0 }: { conversationId: string; refreshKey?: number }) {
  const id = useId();
  const [saved, setSaved] = useState<GroupState | null>(null);
  const [draft, setDraft] = useState<EvolutionGroupMode>("mentions");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestVersion = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const url = `/api/conversations/${conversationId}/group-mode`;
  const cancelLoad = useCallback(() => { ++requestVersion.current; }, []);
  const load = useCallback(async (replaceDraft = false) => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const state: GroupState = { mode: evolutionGroupModeSchema.parse(data.mode), available: data.available === true, canConfigure: data.canConfigure === true };
      if (version !== requestVersion.current) return;
      if (replaceDraft || !savedRef.current || draftRef.current === savedRef.current.mode) setDraft(state.mode);
      setSaved(state);
      setError("");
    } catch {
      if (version === requestVersion.current) setError("Não foi possível carregar o modo do grupo. Tente novamente.");
    }
  }, [url]);
  useEffect(() => {
    void load();
    return cancelLoad;
  }, [load, refreshKey, cancelLoad]);

  async function save() {
    const mode = draft;
    setBusy(true); setError(""); setNotice("");
    ++requestVersion.current;
    try {
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      ++requestVersion.current;
      setSaved({ mode: evolutionGroupModeSchema.parse(data.mode), available: data.available === true, canConfigure: data.canConfigure === true });
      setNotice("Modo salvo. Vale para as novas mensagens deste grupo.");
    } catch {
      setError("Não foi possível confirmar o salvamento. Atualize o modo para conferir ou tente salvar novamente.");
    } finally { setBusy(false); }
  }

  const disabled = busy || !saved?.available || !saved.canConfigure;
  return (
    <div className="mt-4 space-y-3 border-t pt-4" aria-busy={busy}>
      <fieldset disabled={disabled} aria-describedby={`${id}-help`} className="space-y-2">
        <legend className="text-sm font-semibold">Respostas neste grupo</legend>
        <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">Vale para todos os participantes deste grupo. Os históricos continuam separados por pessoa.</p>
        {!saved && !error && <p role="status" className="text-xs text-muted-foreground">Carregando modo do grupo…</p>}
        {saved && ([
          { value: "mentions", title: "Menções e respostas ao agente", description: "Começa com @ e continua pelo botão Responder." },
          { value: "all", title: "Todas as mensagens do grupo", description: "Não precisa mencionar o agente para começar." },
        ] as const).map((option) => (
          <label key={option.value} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md py-2 text-sm has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
            <input type="radio" name={`${id}-mode`} value={option.value} checked={draft === option.value} onChange={() => { setDraft(option.value); setNotice(""); }} className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
            <span className="min-w-0"><span className="block font-medium">{option.title}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{option.description}</span></span>
          </label>
        ))}
      </fieldset>
      {saved && !saved.available && <p className="text-xs text-muted-foreground">O atendimento em grupos está desativado na conexão Evolution Go.</p>}
      {saved && !saved.canConfigure && <p className="text-xs text-muted-foreground">Só administradores podem alterar este modo.</p>}
      {saved?.available && saved.canConfigure && <>
        <p className="text-xs leading-relaxed text-muted-foreground">As pausas de IA e o atendimento humano continuam valendo.</p>
        <Button type="button" className="min-h-11 w-full" disabled={busy || draft === saved.mode} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar modo do grupo"}</Button>
      </>}
      {error && <div className="space-y-2"><p role="alert" className="text-xs leading-relaxed text-destructive">{error}</p><Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => void load(true)}>{saved ? "Atualizar modo" : "Tentar novamente"}</Button></div>}
      {notice && <p role="status" className="text-xs leading-relaxed text-muted-foreground">{notice}</p>}
    </div>
  );
}
