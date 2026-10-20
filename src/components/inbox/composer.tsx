"use client";

import { useEffect, useRef, useState } from "react";
import {
  Clock3,
  FileText,
  MapPin,
  Paperclip,
  Send,
  UserRound,
  X,
} from "lucide-react";
import type { ConversationDto, TemplateDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CHANNEL_LABEL } from "@/lib/channels";
import { formatBytes, formatRemaining, formatRemainingLong } from "./helpers";
import { TemplateSender } from "./template-sender";

/** 008 — Panel secundario del clip: formulario de ubicación o contacto. */
type AttachPanel = "location" | "contact" | null;

/** Extrae lat,long de "21.019, -101.257" o de un enlace de Google Maps. */
function parseCoords(raw: string): { latitude: number; longitude: number } | null {
  const m =
    raw.match(/(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/) ??
    raw.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (!m) return null;
  const latitude = Number(m[1]);
  const longitude = Number(m[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function Composer({
  conversation,
  onSend,
  onSent,
}: {
  conversation: ConversationDto;
  onSend: (text: string) => Promise<string | null>;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [panel, setPanel] = useState<AttachPanel>(null);
  const [coordsRaw, setCoordsRaw] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates?: TemplateDto[] }) => {
        if (!cancelled)
          setTemplates((d.templates ?? []).filter((t) => t.status === "approved"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // La URL del preview de imagen se libera al reemplazar/limpiar el archivo.
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  function autogrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function pickFile(f: File | null) {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(f);
    setFilePreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setPanel(null);
    setError(null);
  }

  async function apiSend(path: string, init: RequestInit): Promise<string | null> {
    const res = await fetch(path, init);
    if (res.ok) return null;
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return data?.message ?? `Error ${res.status}`;
  }

  async function submit() {
    setError(null);

    if (file) {
      // El adjunto sí espera: sube el archivo y no tiene sentido encolar otro
      // mientras tanto.
      if (sending) return;
      setSending(true);
      const form = new FormData();
      form.set("file", file);
      const caption = text.trim();
      if (caption) form.set("caption", caption);
      const err = await apiSend(
        `/api/conversations/${conversation.id}/messages/media`,
        { method: "POST", body: form }
      );
      setSending(false);
      if (err) {
        setError(err);
        return;
      }
      pickFile(null);
      setText("");
      if (taRef.current) taRef.current.style.height = "auto";
      onSent();
      return;
    }

    const value = text.trim();
    if (!value) return;
    // Aquí NO se espera al servidor. Enviar tarda ~1.5 s (el viaje a Meta) y
    // durante ese rato el renglón siguiente se escribía encima del anterior y
    // salía todo como un solo mensaje. El campo se limpia ya; la burbuja
    // "enviando" del hilo es la que informa el estado real.
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
    const err = await onSend(value);
    if (err) {
      setError(err);
      // Lo que no salió vuelve al campo. Si ya empezaste a escribir otra cosa
      // se antepone en vez de pisarte: nada se pierde en silencio.
      setText((actual) => (actual ? `${value}\n${actual}` : value));
      taRef.current?.focus();
      setTimeout(autogrow, 0);
    }
  }

  async function submitLocation() {
    const coords = parseCoords(coordsRaw);
    if (!coords) {
      setError("Coordenadas inválidas — cole «lat, long» ou um link do Google Maps");
      return;
    }
    setSending(true);
    setError(null);
    const err = await apiSend(`/api/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "location",
        location: { ...coords, ...(placeName.trim() ? { name: placeName.trim() } : {}) },
      }),
    });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setPanel(null);
    setCoordsRaw("");
    setPlaceName("");
    onSent();
  }

  async function submitContact() {
    if (!contactName.trim() || contactPhone.trim().length < 5) {
      setError("O contato precisa de nome e telefone");
      return;
    }
    setSending(true);
    setError(null);
    const err = await apiSend(`/api/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "contacts",
        contacts: [{ name: contactName.trim(), phone: contactPhone.trim() }],
      }),
    });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setPanel(null);
    setContactName("");
    setContactPhone("");
    onSent();
  }

  // 022 — TikTok no tiene plantillas ni otra forma de reabrir: con la ventana
  // cerrada no hay nada que ofrecer, solo decir qué pasa y qué lo arregla.
  if (!conversation.windowOpen && conversation.channel === "tiktok") {
    return (
      <div className="border-t bg-background px-[18px] py-3.5">
        <div className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-sm text-warning-text">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
          <div>
            <p className="font-medium">A janela de 48 horas do TikTok está fechada.</p>
            <p className="opacity-80">
              O TikTok só deixa responder dentro das 48 horas seguintes à
              última mensagem do cliente, e não permite reabrir a conversa.
              Você poderá escrever quando a pessoa mandar uma nova mensagem.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 024 — Instagram y Messenger no tienen plantillas. Pasadas 24 horas una
  // persona todavía puede contestar (hasta 7 días, sigue abajo con su aviso);
  // pasado ese plazo no hay nada que ofrecer salvo esperar al cliente.
  const human = conversation.humanWindow;
  const canal = CHANNEL_LABEL[conversation.channel];
  if (!conversation.windowOpen && human && !human.open) {
    return (
      <div className="border-t bg-background px-[18px] py-3.5">
        <div
          data-window="closed"
          className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-sm text-warning-text"
        >
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
          <div>
            <p className="font-medium">A janela de atendimento do {canal} está fechada.</p>
            <p className="opacity-80">
              O {canal} deixa responder até 7 dias depois da última mensagem
              do cliente, e não tem templates para reabrir a conversa.
              Você poderá escrever quando a pessoa mandar uma nova mensagem.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!conversation.windowOpen && !human) {
    return (
      <div className="border-t bg-background px-[18px] py-3.5">
        <div className="mb-3 flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-sm text-warning-text">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
          <div>
            <p className="font-medium">A janela de 24 horas está fechada.</p>
            <p className="opacity-80">
              O WhatsApp só permite texto livre dentro das 24 horas
              seguintes à última mensagem do cliente. Para retomar a
              conversa, envie um template aprovado.
            </p>
          </div>
        </div>
        <TemplateSender conversationId={conversation.id} onSent={onSent} />
      </div>
    );
  }

  const canSubmit = file !== null || text.trim().length > 0;

  const soloPersona = !conversation.windowOpen && Boolean(human?.open);

  return (
    <div className="border-t bg-background px-[18px] pb-3.5 pt-3">
      {soloPersona && (
        <div
          data-window="human"
          className="mb-2.5 flex items-start gap-2 rounded-md border border-info-soft bg-info-tint p-2.5 text-xs text-info-text"
        >
          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
          <p>
            <span className="font-semibold">Só uma pessoa pode responder.</span>{" "}
            Passaram mais de 24 horas desde a última mensagem do cliente: o {canal}{" "}
            deixa você responder por até 7 dias, mas o agente não.
          </p>
        </div>
      )}
      {templates.length > 0 && !file && panel === null && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {templates.slice(0, 4).map((t) => (
            <button
              key={t.id}
              className="rounded-full border border-border-strong bg-background px-3 py-1 text-xs font-semibold text-text-2 transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand-text"
              onClick={() => {
                const firstName = conversation.contact.name.split(" ")[0] ?? "";
                setText(t.body.replace(/\{\{\s*1\s*\}\}/g, firstName));
                taRef.current?.focus();
                setTimeout(autogrow, 0);
              }}
              title={t.body}
            >
              {t.name.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}

      {file && (
        <div className="mb-2.5 flex items-center gap-2.5 rounded-md border bg-subtle p-2.5">
          {filePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={filePreview}
              alt={file.name}
              className="h-14 w-14 rounded object-cover"
            />
          ) : (
            <FileText className="h-8 w-8 shrink-0 text-brand" strokeWidth={1.5} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-text-3">
              {formatBytes(file.size)} · o texto abaixo vai como legenda do anexo
            </p>
          </div>
          <button
            onClick={() => pickFile(null)}
            aria-label="Remover anexo"
            className="rounded p-1 text-text-3 hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
      )}

      {panel === "location" && (
        <div className="mb-2.5 flex flex-wrap items-end gap-2 rounded-md border bg-subtle p-2.5">
          <label className="min-w-0 flex-1 text-xs text-text-2">
            Coordenadas ou link do Google Maps
            <input
              value={coordsRaw}
              onChange={(e) => setCoordsRaw(e.target.value)}
              placeholder="21.019, -101.257"
              className="mt-1 w-full rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-sm outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-[3px] focus:ring-brand-soft"
            />
          </label>
          <label className="min-w-0 flex-1 text-xs text-text-2">
            Nome do lugar (opcional)
            <input
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder="Escritório Central"
              className="mt-1 w-full rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-sm outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-[3px] focus:ring-brand-soft"
            />
          </label>
          <button
            onClick={() => void submitLocation()}
            disabled={sending}
            className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-brand-fg shadow-sm hover:bg-brand-hover disabled:opacity-40"
          >
            Enviar localização
          </button>
          <button
            onClick={() => setPanel(null)}
            aria-label="Cancelar"
            className="rounded p-1 text-text-3 hover:bg-secondary"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
      )}

      {panel === "contact" && (
        <div className="mb-2.5 flex flex-wrap items-end gap-2 rounded-md border bg-subtle p-2.5">
          <label className="min-w-0 flex-1 text-xs text-text-2">
            Nome
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="João Silva"
              className="mt-1 w-full rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-sm outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-[3px] focus:ring-brand-soft"
            />
          </label>
          <label className="min-w-0 flex-1 text-xs text-text-2">
            Telefone
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+55 11 91234-5678"
              className="mt-1 w-full rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-sm outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-[3px] focus:ring-brand-soft"
            />
          </label>
          <button
            onClick={() => void submitContact()}
            disabled={sending}
            className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-brand-fg shadow-sm hover:bg-brand-hover disabled:opacity-40"
          >
            Enviar contacto
          </button>
          <button
            onClick={() => setPanel(null)}
            aria-label="Cancelar"
            className="rounded p-1 text-text-3 hover:bg-secondary"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
      )}

      {/* La caja de escritura en píldora, como la del mockup de la landing */}
      <div className="flex items-end gap-2 rounded-[23px] border border-border-strong bg-background py-1.5 pl-2 pr-1.5 shadow-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {/* 028: solo lo que el canal puede mandar; en las redes, la caja sola. */}
        {(conversation.composer.media || conversation.composer.structured) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {conversation.composer.media && (
              <button
                onClick={() => fileRef.current?.click()}
                aria-label="Anexar arquivo"
                title="Anexar imagem, vídeo, áudio ou documento"
                className="rounded p-1.5 text-text-3 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.7} />
              </button>
            )}
            {conversation.composer.structured && (
              <>
                <button
                  onClick={() => setPanel(panel === "location" ? null : "location")}
                  aria-label="Enviar localização"
                  title="Enviar localização"
                  className={cn(
                    "rounded p-1.5 text-text-3 transition-colors hover:bg-secondary hover:text-foreground",
                    panel === "location" && "bg-secondary text-brand"
                  )}
                >
                  <MapPin className="h-[18px] w-[18px]" strokeWidth={1.7} />
                </button>
                <button
                  onClick={() => setPanel(panel === "contact" ? null : "contact")}
                  aria-label="Compartilhar contato"
                  title="Compartilhar contato"
                  className={cn(
                    "rounded p-1.5 text-text-3 transition-colors hover:bg-secondary hover:text-foreground",
                    panel === "contact" && "bg-secondary text-brand"
                  )}
                >
                  <UserRound className="h-[18px] w-[18px]" strokeWidth={1.7} />
                </button>
              </>
            )}
          </div>
        )}
        <textarea
          ref={taRef}
          placeholder={file ? "Legenda do anexo (opcional)…" : "Escreva uma resposta…"}
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            autogrow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          className="max-h-[120px] w-full resize-none self-center bg-transparent py-1 text-sm leading-relaxed outline-none placeholder:text-text-3"
        />
        <button
          onClick={() => void submit()}
          disabled={sending || !canSubmit}
          aria-label="Enviar"
          className={cn(
            "flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg transition-[opacity,background-color] hover:bg-brand-hover",
            (sending || !canSubmit) && "opacity-40"
          )}
        >
          <Send className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
        <p className="font-mono text-[10.5px] tracking-[0.04em] text-text-3">
          {soloPersona
            ? `Janela humana · restam ${formatRemainingLong(human!.remainingMs)}`
            : `Janela aberta · restam ${formatRemaining(conversation.windowRemainingMs)}`}
        </p>
      </div>
    </div>
  );
}
