"use client";

import { useEffect, useState } from "react";
import type { SourceValue, StageDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const SOURCES: { value: SourceValue; label: string }[] = [
  { value: "referido", label: "Indicação" },
  { value: "organico", label: "Conteúdo orgânico" },
  { value: "conocido", label: "Conhecido" },
  { value: "anuncio", label: "Anúncio" },
  { value: "otro", label: "Outro" },
];

/**
 * Alta manual de un prospecto que no llegó por WhatsApp.
 * El teléfono es obligatorio porque ES la identidad en WhatsApp: sin él, el
 * contacto no podría recibir ni mandar nada, y sería una ficha muerta.
 */
export function NewContactDialog({
  onClose,
  onCreated,
  onOpenExisting,
}: {
  onClose: () => void;
  onCreated: () => void;
  /** Duplicado: en vez de un error seco, se ofrece ir a quien ya existe. */
  onOpenExisting: (contactId: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState<SourceValue>("referido");
  const [notes, setNotes] = useState("");
  const [stages, setStages] = useState<StageDto[]>([]);
  const [stageId, setStageId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<{ id: string; name: string } | null>(
    null
  );

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/pipeline/stages").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { stages: StageDto[] };
      const abiertas = data.stages.filter((s) => s.kind === "open");
      setStages(abiertas);
      setStageId(abiertas[0]?.id ?? "");
    })();
  }, []);

  async function guardar() {
    setSaving(true);
    setError(null);
    setDuplicado(null);
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim(),
        source,
        notes: notes.trim() || undefined,
        stageId: stageId || undefined,
      }),
    }).catch(() => null);
    setSaving(false);

    if (!res) {
      setError("Não foi possível salvar. Verifique sua conexão.");
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      contact?: { id: string; name: string };
    } | null;

    if (res.status === 409 && data?.contact) {
      setDuplicado({ id: data.contact.id, name: data.contact.name });
      return;
    }
    if (!res.ok) {
      setError(data?.error?.message ?? "Não foi possível salvar o contato");
      return;
    }
    onCreated();
  }

  // 11 dígitos = código de país + número. Ver la nota del endpoint sobre por
  // qué el código de país no puede faltar ni asumirse.
  const listo = name.trim().length > 0 && phone.replace(/\D/g, "").length >= 11;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Novo contato"
        className="w-full max-w-md rounded-lg border bg-popover p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">Novo contato</h3>
        <p className="mb-4 text-xs text-text-3">
          Para prospects que não chegaram pelo WhatsApp: indicações, pessoas que te
          escreveram por outra rede, conhecidos.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nc-name">
              Nome
            </label>
            <Input
              id="nc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Loja Central"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nc-phone">
              Telefone com código do país
            </label>
            <Input
              id="nc-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="1 407 555 1234"
            />
            <p className="text-[11px] text-text-3">
              Pode escrever com espaços, mas{" "}
              <strong>inclua o código do país</strong> (1 para EUA, 55 para Brasil). Sem
              ele, o WhatsApp não reconhece como a mesma pessoa que te escrever
              depois.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="nc-source">
                De onde veio?
              </label>
              <select
                id="nc-source"
                value={source}
                onChange={(e) => setSource(e.target.value as SourceValue)}
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="nc-stage">
                Etapa inicial
              </label>
              <select
                id="nc-stage"
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="nc-notes">
              Notas (opcional)
            </label>
            <Textarea
              id="nc-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Indicação do João; tem oficina de motos…"
            />
          </div>
        </div>

        {duplicado && (
          <div className="mt-3 rounded-md border border-warning-soft bg-warning-tint px-3 py-2.5">
            <p className="text-[13px] text-warning-text">
              Esse telefone já é de <strong>{duplicado.name}</strong>. Não foi criado
              um duplicado.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => onOpenExisting(duplicado.id)}
            >
              Abrir a conversa
            </Button>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-danger-text">{error}</p>}
        {stages.length === 0 && (
          <p className="mt-3 text-xs text-warning-text">
            Seu funil não tem etapas abertas. Crie uma no Funil antes de
            cadastrar contatos.
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!listo || saving || stages.length === 0}
            onClick={() => void guardar()}
          >
            {saving ? "Salvando…" : "Criar contato"}
          </Button>
        </div>
      </div>
    </div>
  );
}
