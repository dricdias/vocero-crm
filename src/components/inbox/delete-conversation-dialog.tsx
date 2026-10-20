"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * 026 — Confirmación de borrado. Es irreversible, así que dice con todas sus
 * letras qué se va y qué se queda — y lo dice distinto según la casilla,
 * porque «también el contacto» cambia los números de Resultados y eso no se
 * adivina.
 */
export function DeleteConversationDialog({
  contactName,
  onCancel,
  onConfirm,
}: {
  contactName: string;
  onCancel: () => void;
  /** Devuelve el mensaje de error, o null si se eliminó. */
  onConfirm: (alsoContact: boolean) => Promise<string | null>;
}) {
  const [alsoContact, setAlsoContact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape cancela, como en cualquier diálogo. Enter NO confirma: borrar para
  // siempre no puede salir de una tecla suelta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  async function confirm() {
    setBusy(true);
    setError(null);
    const problema = await onConfirm(alsoContact);
    // Si salió bien, quien abrió el diálogo ya lo cerró: no hay estado que tocar.
    if (problema) {
      setError(problema);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Excluir conversa"
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">Excluir esta conversa?</h3>
        <p className="mb-3 text-[13px] leading-relaxed text-text-2">
          São apagadas as mensagens com {contactName}, os anexos, a ficha e o
          que o agente lembra desta conversa. Se a pessoa voltar a escrever, o
          agente começa do zero.
        </p>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border bg-subtle p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--danger)]"
            checked={alsoContact}
            disabled={busy}
            onChange={(e) => setAlsoContact(e.target.checked)}
          />
          <span className="text-[13px] leading-snug">
            <span className="font-medium">Apagar também o contato e o lead dele</span>
            <span className="mt-0.5 block text-xs text-text-3">
              {alsoContact
                ? "Também são apagadas as notas, a etapa no funil e os agendamentos passados. Deixa de contar em Resultados."
                : "Sem marcar, o contato mantém as notas, a etapa e os agendamentos."}
            </span>
          </span>
        </label>

        <p className="mt-3 text-xs font-medium text-danger-text">Não é possível desfazer.</p>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-danger-soft bg-danger-tint p-2.5 text-xs text-danger-text"
          >
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy
              ? "Excluindo…"
              : alsoContact
                ? "Excluir conversa e contato"
                : "Excluir conversa"}
          </Button>
        </div>
      </div>
    </div>
  );
}
