"use client";

import { useEffect, useRef, useState } from "react";
import type { ConversationDto, MessageDto } from "@/lib/types";
import { CHANNEL_LABEL } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 042 — Reenviar la imagen de un mensaje a otra conversación. Elegir un
 * destino no envía: hace falta el botón que lleva su nombre. Mientras sale, ni
 * Escape ni un clic fuera cierran el diálogo, y un segundo clic no duplica.
 */
export function ForwardImageDialog({
  message,
  conversations,
  onClose,
  onSent,
}: {
  message: MessageDto;
  conversations: ConversationDto[];
  onClose: () => void;
  onSent: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const [caption, setCaption] = useState(message.media?.caption ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  // Solo conversaciones que pueden recibir una imagen (hoy, WhatsApp), y no
  // la del propio mensaje.
  const candidates = conversations.filter(
    (c) => c.composer.media && c.id !== message.conversationId
  );
  const q = query.trim().toLocaleLowerCase("es");
  const targets = candidates.filter((c) =>
    `${c.contact.name} ${c.contact.phone ?? ""}`.toLocaleLowerCase("es").includes(q)
  );
  const selected = candidates.find((c) => c.id === targetId);
  const canSend = Boolean(selected?.windowOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    if (!canSend || !selected || busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/conversations/${selected.id}/messages/forward-image`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceMessageId: message.id, caption }),
        }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(data?.error?.message ?? "No se pudo reenviar la imagen. Intenta de nuevo.");
        return;
      }
      onSent(selected.contact.name);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta reenviar de nuevo.");
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={() => {
        if (!busy.current) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reenviar imagen"
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 font-semibold">Reenviar imagen</h3>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/${message.media!.assetId}`}
          alt="Imagen para reenviar"
          className="mx-auto mb-3 max-h-40 max-w-full rounded-md object-contain"
        />
        <label className="mb-3 block text-xs text-text-2">
          Pie de la imagen (opcional)
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={1024}
            disabled={sending}
            rows={2}
            className="mt-1 w-full resize-none rounded-md border border-input bg-background p-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-[3px] focus:ring-brand-soft"
          />
        </label>
        <label className="mb-2 block text-xs text-text-2">
          Buscar destinatario
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={sending}
            placeholder="Nombre o teléfono"
            className="mt-1"
          />
        </label>
        <fieldset disabled={sending} className="mb-3 max-h-56 min-h-0 space-y-1 overflow-y-auto">
          <legend className="sr-only">Conversación de destino</legend>
          {targets.map((c) => (
            <label
              key={c.id}
              className={cn(
                "flex items-center gap-3 rounded-md border p-2.5 text-sm",
                c.windowOpen ? "cursor-pointer hover:bg-subtle" : "opacity-60",
                targetId === c.id && "border-brand bg-brand-tint"
              )}
            >
              <input
                type="radio"
                name="forward-destination"
                value={c.id}
                checked={targetId === c.id}
                disabled={!c.windowOpen || sending}
                onChange={() => {
                  setTargetId(c.id);
                  setError(null);
                }}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.contact.name}</span>
                <span className="block text-xs text-text-3">
                  {c.windowOpen
                    ? c.contact.phone ?? CHANNEL_LABEL[c.channel]
                    : "Ventana de 24 horas cerrada"}
                </span>
              </span>
            </label>
          ))}
          {targets.length === 0 && (
            <p className="p-2.5 text-sm text-text-3">No hay conversaciones que coincidan.</p>
          )}
        </fieldset>
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-md border border-danger-soft bg-danger-tint p-2.5 text-xs text-danger-text"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={sending} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="h-auto min-h-9 max-w-full whitespace-normal break-words"
            disabled={!canSend || sending}
            onClick={() => void send()}
          >
            {sending
              ? "Reenviando…"
              : selected
                ? `Reenviar a ${selected.contact.name}`
                : "Elige a quién"}
          </Button>
        </div>
      </div>
    </div>
  );
}
