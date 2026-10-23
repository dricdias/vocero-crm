"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  Clock3,
  FileText,
  Mic,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import type { ConversationDto, MessageDto, TemplateDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CHANNEL_LABEL } from "@/lib/channels";
import {
  citaDe,
  formatBytes,
  formatRemaining,
  formatRemainingLong,
} from "./helpers";
import { QuoteBlock } from "./quote-block";
import { TemplateSender } from "./template-sender";
import { validarImagenAdjunta } from "@/lib/imagen-adjunta";
import { EmojiPicker } from "./emoji-picker";
import { insertAtSelection } from "@/lib/emojis";
import { VoiceRecorder, type NotaGrabada } from "./voice-recorder";

export function Composer({
  conversation,
  onSend,
  onSent,
  replyTo = null,
  onReplyChange,
  children,
}: {
  conversation: ConversationDto;
  onSend: (text: string, replyTo: MessageDto | null) => Promise<string | null>;
  onSent: () => void;
  /** 039: el mensaje al que se está respondiendo citando, si hay. */
  replyTo?: MessageDto | null;
  onReplyChange?: (m: MessageDto | null) => void;
  /** 043 — El hilo: la zona donde se suelta una imagen es la conversación entera. */
  children?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 042 — `sending` tarda un render en verse; esto corta el doble envío ya.
  const mediaSending = useRef(false);
  // 041 — Dónde dejar el cursor cuando el texto con el emoji ya se pintó.
  const emojiCaret = useRef<number | null>(null);
  // 043 — Entrar y salir de los hijos dispara dragenter/dragleave en cascada:
  // se cuenta la profundidad para que el indicador no parpadee.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  // 044 — La grabadora ocupa el lugar de la caja mientras está abierta.
  const [grabando, setGrabando] = useState(false);
  // Hay caja de texto libre (ventana normal, o la humana de Instagram/Messenger).
  const textoLibre = conversation.windowOpen || Boolean(conversation.humanWindow?.open);

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

  // 039: al elegir «Responder» se escribe ya, sin buscar el campo.
  useEffect(() => {
    if (replyTo) taRef.current?.focus();
  }, [replyTo]);

  // 043 — Soltar un archivo fuera del chat abriría el archivo en la pestaña y
  // el CRM (con el borrador) se perdería. Mientras haya conversación abierta,
  // un archivo soltado en otro punto de la página no hace nada.
  useEffect(() => {
    const esArchivo = (e: globalThis.DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const frenar = (e: globalThis.DragEvent) => {
      if (esArchivo(e)) e.preventDefault();
    };
    window.addEventListener("dragover", frenar);
    window.addEventListener("drop", frenar);
    return () => {
      window.removeEventListener("dragover", frenar);
      window.removeEventListener("drop", frenar);
    };
  }, []);

  // La URL del preview de imagen se libera al reemplazar/limpiar el archivo.
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el || emojiCaret.current === null) return;
    el.focus();
    el.setSelectionRange(emojiCaret.current, emojiCaret.current);
    emojiCaret.current = null;
    autogrow();
  }, [text]);

  function autogrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  /** 041 — El emoji entra en el cursor (o en lugar de la selección); no envía. */
  function insertEmoji(emoji: string) {
    const el = taRef.current;
    if (!el || sending) return;
    const next = insertAtSelection(text, el.selectionStart, el.selectionEnd, emoji);
    if (next.text === text) {
      // Reemplazar un emoji por el mismo no cambia el texto ni dispara el
      // efecto: el cursor se coloca aquí.
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      return;
    }
    emojiCaret.current = next.caret;
    setText(next.text);
  }

  function pickFile(f: File | null) {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(f);
    setFilePreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setError(null);
  }

  /**
   * 042 — Una imagen del portapapeles (o, 043, soltada en el chat): se valida
   * aquí y queda como adjunto. Nunca envía.
   */
  function attachImage(files: File[], origen: "paste" | "drop") {
    if (sending || mediaSending.current) return;
    if (!conversation.composer.media) {
      setError(`Pegar y arrastrar imágenes está disponible en WhatsApp; ${CHANNEL_LABEL[conversation.channel]} no admite adjuntos.`);
      return;
    }
    if (!textoLibre) {
      setError("La ventana está cerrada: no se puede adjuntar una imagen. Solo sale una plantilla.");
      return;
    }
    const result = validarImagenAdjunta(files, origen);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    pickFile(result.file);
    taRef.current?.focus();
  }

  function isFileDrag(e: DragEvent<HTMLDivElement>) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  /** Con un diálogo modal abierto (reenviar imagen), soltar no adjunta atrás. */
  function modalAbierto(e: DragEvent<HTMLDivElement>) {
    return e.currentTarget.querySelector('[role="dialog"][aria-modal="true"]') !== null;
  }

  /**
   * 043 — La conversación entera (el hilo, que llega como `children`, y el
   * compositor) acepta una imagen soltada. Solo reacciona a arrastres de
   * archivos: arrastrar texto o un enlace sigue como siempre.
   */
  function withDropZone(content: ReactNode, conError = false) {
    const acceptsDrop = conversation.composer.media && textoLibre && !sending;
    return (
      <div
        role="region"
        aria-label="Chat: adjuntar imagen"
        className="relative flex min-h-0 flex-1 flex-col"
        onDragEnter={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          dragDepth.current++;
          if (acceptsDrop && !modalAbierto(e)) setDragging(true);
        }}
        onDragOver={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = acceptsDrop ? "copy" : "none";
        }}
        onDragLeave={(e) => {
          if (!isFileDrag(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (modalAbierto(e)) return;
          attachImage(Array.from(e.dataTransfer.files), "drop");
        }}
      >
        {children}
        {content}
        {conError && error && (
          <p role="alert" className="bg-background px-[18px] pb-3 text-xs text-destructive">
            {error}
          </p>
        )}
        {dragging && acceptsDrop && (
          <div
            role="status"
            className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-brand bg-brand-tint p-4"
          >
            <p className="rounded-md bg-background px-4 py-3 text-center text-sm font-semibold text-brand-ink shadow-sm">
              Suelta la imagen para adjuntarla
            </p>
          </div>
        )}
      </div>
    );
  }

  async function apiSend(path: string, init: RequestInit): Promise<string | null> {
    try {
      const res = await fetch(path, init);
      if (res.ok) return null;
      // apiError responde `{ error: { code, message } }`.
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return data?.error?.message ?? `Error ${res.status}`;
    } catch {
      return "No se pudo conectar con el servidor. Lo que ibas a mandar sigue aquí para reintentar.";
    }
  }

  async function submit() {
    setError(null);

    if (file) {
      // El adjunto sí espera: sube el archivo y no tiene sentido encolar otro
      // mientras tanto.
      if (mediaSending.current) return;
      mediaSending.current = true;
      dragDepth.current = 0;
      setDragging(false);
      setSending(true);
      const form = new FormData();
      form.set("file", file);
      const caption = text.trim();
      if (caption) form.set("caption", caption);
      if (replyTo) form.set("replyToMessageId", replyTo.id);
      const err = await apiSend(
        `/api/conversations/${conversation.id}/messages/media`,
        { method: "POST", body: form }
      );
      setSending(false);
      mediaSending.current = false;
      if (err) {
        setError(err);
        return;
      }
      pickFile(null);
      setText("");
      if (taRef.current) taRef.current.style.height = "auto";
      onReplyChange?.(null);
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
    const cita = replyTo;
    onReplyChange?.(null);
    const err = await onSend(value, cita);
    if (err) {
      setError(err);
      // 039: la cita vuelve con el texto.
      if (cita) onReplyChange?.(cita);
      // Lo que no salió vuelve al campo. Si ya empezaste a escribir otra cosa
      // se antepone en vez de pisarte: nada se pierde en silencio.
      setText((actual) => (actual ? `${value}\n${actual}` : value));
      taRef.current?.focus();
      setTimeout(autogrow, 0);
    }
  }

  /** 044 — La nota grabada sale por el mismo envío de adjuntos, marcada como voz. */
  async function enviarNota(nota: NotaGrabada): Promise<string | null> {
    if (mediaSending.current) return "Ya se está enviando un adjunto.";
    mediaSending.current = true;
    setSending(true);
    setError(null);
    const form = new FormData();
    form.set("file", nota.archivo);
    form.set("voice", "1");
    if (replyTo) form.set("replyToMessageId", replyTo.id);
    const err = await apiSend(`/api/conversations/${conversation.id}/messages/media`, {
      method: "POST",
      body: form,
    });
    setSending(false);
    mediaSending.current = false;
    if (err) return err;
    setGrabando(false);
    onReplyChange?.(null);
    onSent();
    return null;
  }

  // 022 — TikTok no tiene plantillas ni otra forma de reabrir: con la ventana
  // cerrada no hay nada que ofrecer, solo decir qué pasa y qué lo arregla.
  if (!conversation.windowOpen && conversation.channel === "tiktok") {
    return withDropZone(
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
      </div>,
      true
    );
  }

  // 024 — Instagram y Messenger no tienen plantillas. Pasadas 24 horas una
  // persona todavía puede contestar (hasta 7 días, sigue abajo con su aviso);
  // pasado ese plazo no hay nada que ofrecer salvo esperar al cliente.
  const human = conversation.humanWindow;
  const canal = CHANNEL_LABEL[conversation.channel];
  if (!conversation.windowOpen && human && !human.open) {
    return withDropZone(
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
      </div>,
      true
    );
  }

  if (!conversation.windowOpen && !human) {
    return withDropZone(
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
      </div>,
      true
    );
  }

  const canSubmit = file !== null || text.trim().length > 0;
  // 044 — Con la caja vacía el botón graba, como en WhatsApp.
  const puedeGrabar = conversation.composer.media && !file && !text.trim();

  const soloPersona = !conversation.windowOpen && Boolean(human?.open);

  return withDropZone(
    <div className="relative border-t bg-background px-[18px] pb-3.5 pt-3">

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
      {templates.length > 0 && !file && (
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

      {replyTo && (
        <div
          data-replying-to={replyTo.id}
          className="mb-2.5 flex items-center gap-2 rounded-md border bg-subtle p-2"
        >
          <QuoteBlock
            cita={citaDe(replyTo)}
            contactName={conversation.contact.name}
            className="flex-1"
          />
          <button
            onClick={() => onReplyChange?.(null)}
            aria-label="Cancelar respuesta"
            title="Cancelar respuesta"
            className="shrink-0 rounded p-1 text-text-3 hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
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
            disabled={sending}
            aria-label="Remover anexo"
            className="rounded p-1 text-text-3 hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
      )}

      {grabando ? (
        <VoiceRecorder
          onSend={enviarNota}
          onCancel={() => setGrabando(false)}
          onError={(msg) => {
            setGrabando(false);
            setError(msg);
          }}
        />
      ) : (
      /* La caja de escritura en píldora, como la del mockup de la landing */
      <div className="flex items-end gap-2 rounded-[23px] border border-border-strong bg-background py-1.5 pl-2 pr-1.5 shadow-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          disabled={sending}
          onChange={(e) => {
            if (!sending) pickFile(e.target.files?.[0] ?? null);
            // Elegir el mismo archivo otra vez también avisa.
            e.target.value = "";
          }}
        />
        <EmojiPicker disabled={sending} onSelect={insertEmoji} />
        {/* 028: solo lo que el canal puede mandar; en las redes, la caja sola.
            045: ubicación y contacto ya no se ofrecen (el servidor los sigue
            sabiendo enviar, para un cerebro conectado). */}
        {conversation.composer.media && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            aria-label="Anexar arquivo"
            title="Anexar imagem, vídeo, áudio ou documento"
            className="shrink-0 rounded p-1.5 text-text-3 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </button>
        )}
        <textarea
          ref={taRef}
          placeholder={file ? "Legenda do anexo (opcional)…" : "Escreva uma resposta…"}
          value={text}
          rows={1}
          onPaste={(e) => {
            const images = Array.from(e.clipboardData.items).filter(
              (item) => item.kind === "file" && item.type.startsWith("image/")
            );
            if (images.length === 0) return; // texto: el pegado de siempre
            e.preventDefault();
            const files = images.map((item) => item.getAsFile());
            if (files.some((f) => !f)) {
              setError("No se pudo leer la imagen del portapapeles. Cópiala de nuevo.");
              return;
            }
            attachImage(files as File[], "paste");
          }}
          onChange={(e) => {
            setText(e.target.value);
            autogrow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape" && replyTo) {
              onReplyChange?.(null);
            }
          }}
          className="max-h-[120px] w-full resize-none self-center bg-transparent py-1 text-sm leading-relaxed outline-none placeholder:text-text-3"
        />
        {puedeGrabar ? (
          <button
            onClick={() => {
              setError(null);
              setGrabando(true);
            }}
            disabled={sending}
            aria-label="Grabar nota de voz"
            title="Grabar nota de voz"
            className={cn(
              "flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg transition-[opacity,background-color] hover:bg-brand-hover",
              sending && "opacity-40"
            )}
          >
            <Mic className="h-4 w-4" strokeWidth={1.7} />
          </button>
        ) : (
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
        )}
      </div>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : (
          <span />
        )}
        <p className="font-mono text-[10.5px] tracking-[0.04em] text-text-3">
          {soloPersona
            ? `Janela humana · restam ${formatRemainingLong(human!.remainingMs)}`
            : `Janela aberta · restam ${formatRemaining(conversation.windowRemainingMs)}`}
        </p>
      </div>
    </div>
  );
}
