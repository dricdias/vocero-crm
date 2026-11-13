"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { leerEventoDeAlta, opcionesDeInit, opcionesDeLogin } from "@/lib/meta/signup-event";

/**
 * 066 — «Conectar con Meta» (Embedded Signup v4).
 *
 * Sin la app configurada en la instancia (GET 404) no se dibuja nada: queda
 * el alta manual de siempre (CA-1).
 *
 * El popup tiene que abrirse DIRECTO en el clic: un `await` antes y el
 * navegador lo bloquea. Por eso todo lo que necesita `FB.login` se carga al
 * montar, no al pulsar.
 */

type Config = {
  ready: boolean;
  canManage: boolean;
  appId?: string;
  configId?: string;
  graphVersion?: string;
};
type Facebook = {
  init: (o: object) => void;
  login: (cb: (r: { authResponse?: { code?: string } | null }) => void, o: object) => void;
};
type Pendiente = {
  pin: string | null;
  code?: string;
  evento?: { wabaId: string; phoneNumberId: string | null };
  enviando: boolean;
};
export type ResultadoEmbebido = {
  displayPhoneNumber: string;
  generatedPin?: string;
  webhook: unknown;
};

const fb = () => (window as Window & { FB?: Facebook }).FB;
const API = "/api/settings/whatsapp/embedded";

export function EmbeddedSignup({
  onConnected,
}: {
  onConnected: (resultado: ResultadoEmbebido) => void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [oculto, setOculto] = useState(false);
  const [sdk, setSdk] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState<ResultadoEmbebido | null>(null);
  const activo = useRef<Pendiente | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hecho = useRef(onConnected);
  hecho.current = onConnected;

  useEffect(() => {
    void (async () => {
      const res = await fetch(API, { cache: "no-store" }).catch(() => null);
      if (!res) return setError("Não conseguimos verificar se a conexão com a Meta está disponível.");
      if (res.status === 404) return setOculto(true);
      if (res.ok) setConfig((await res.json()) as Config);
    })();
    return () => {
      activo.current = null;
      if (reloj.current) clearTimeout(reloj.current);
    };
  }, []);

  const fallar = useCallback((msg: string) => {
    activo.current = null;
    if (reloj.current) clearTimeout(reloj.current);
    setBusy(false);
    setError(msg);
  }, []);

  const enviar = useCallback(async () => {
    const p = activo.current;
    if (!p?.code || !p.evento || p.enviando) return;
    p.enviando = true;
    if (reloj.current) clearTimeout(reloj.current);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: p.code,
          wabaId: p.evento.wabaId,
          phoneNumberId: p.evento.phoneNumberId,
          pin: p.pin,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const data = (await res.json().catch(() => null)) as
        | (ResultadoEmbebido & { error?: { message?: string } })
        | null;
      if (!res.ok || !data) {
        return fallar(data?.error?.message ?? "Não foi possível concluir a conexão.");
      }
      activo.current = null;
      setBusy(false);
      setPin("");
      setExito(data);
      hecho.current(data);
    } catch (e) {
      fallar(
        e instanceof Error && e.name === "TimeoutError"
          ? "A confirmação demorou demais. Recarregue a página para ver se ficou conectado antes de repetir."
          : "Sem conexão com o servidor."
      );
    }
  }, [fallar]);

  useEffect(() => {
    const recibir = (ev: MessageEvent) => {
      if (!activo.current || activo.current.enviando) return;
      const e = leerEventoDeAlta(ev.origin, ev.data);
      if (!e) return;
      if (e.kind === "cancel") return fallar("A conexão foi cancelada na Meta. Você pode tentar de novo.");
      if (e.kind === "error") {
        return fallar(`A Meta informou um erro${e.message ? `: ${e.message}` : ""}. Você pode tentar de novo.`);
      }
      if (e.kind === "coexistence") {
        return fallar(
          "Na Meta foi escolhido conectar o app WhatsApp Business do celular (coexistência), que esta versão não aceita. Nada foi salvo."
        );
      }
      activo.current.evento = { wabaId: e.wabaId, phoneNumberId: e.phoneNumberId };
      void enviar();
    };
    window.addEventListener("message", recibir);
    return () => window.removeEventListener("message", recibir);
  }, [enviar, fallar]);

  function iniciarSdk() {
    const f = fb();
    if (!f || !config?.appId || !config.graphVersion) return;
    f.init(opcionesDeInit(config.appId, config.graphVersion));
    setSdk(true);
  }

  const pinValido = pin === "" || /^\d{6}$/.test(pin);

  function lanzar() {
    const f = fb();
    if (!f || !config?.configId || !pinValido || activo.current) return;
    const p: Pendiente = { pin: pin || null, enviando: false };
    activo.current = p;
    setBusy(true);
    setError("");
    setExito(null);
    reloj.current = setTimeout(
      () => fallar("A Meta não concluiu a conexão. Permita as janelas pop-up e tente de novo."),
      10 * 60_000
    );
    try {
      f.login((r) => {
        if (activo.current !== p || p.enviando) return;
        if (!r.authResponse?.code) return fallar("A Meta não autorizou a conexão. Você pode tentar de novo.");
        p.code = r.authResponse.code;
        void enviar();
      }, opcionesDeLogin(config.configId));
    } catch {
      fallar("Não foi possível abrir a Meta. Permita as janelas pop-up e tente de novo.");
    }
  }

  if (oculto) return null;

  return (
    <Card>
      {config?.ready && config.canManage && (
        <Script
          id="meta-sdk"
          src="https://connect.facebook.net/pt_BR/sdk.js"
          strategy="afterInteractive"
          onReady={iniciarSdk}
          onError={() => setError("Não foi possível carregar a Meta. Verifique o bloqueador do navegador e recarregue.")}
        />
      )}
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Conectar com a Meta
        </CardTitle>
        <CardDescription>
          A conexão oficial: você autoriza a sua conta na janela da Meta e o
          CRM registra o número e o webhook sem copiar tokens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!config && !error && <p className="text-muted-foreground">Verificando disponibilidade…</p>}
        {config && !config.canManage && (
          <p className="text-muted-foreground">Só quem administra a conta pode conectar o WhatsApp.</p>
        )}

        {config?.canManage && (
          <>
            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="embedded-pin">
                PIN de verificação em duas etapas{" "}
                <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="embedded-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                disabled={busy}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-xs text-muted-foreground">
                Só se o seu número já tiver um. Se deixar vazio, geramos
                um ao registrar o número e mostramos uma única vez.
              </p>
            </div>

            <Button disabled={!sdk || busy || !pinValido} onClick={lanzar}>
              {busy ? "Concluindo a conexão…" : "Conectar com a Meta"}
            </Button>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-danger-soft bg-danger-tint p-3 text-danger-text">
            {error}
          </p>
        )}
        {exito && (
          <div
            role="status"
            className="space-y-2 rounded-lg border border-success-soft bg-success-tint p-3 text-success-text"
          >
            <p className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Conectado {exito.displayPhoneNumber}.
            </p>
            {exito.generatedPin && (
              <p className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  PIN de verificação em duas etapas do número:{" "}
                  <b className="font-mono tracking-widest">{exito.generatedPin}</b>. Guarde no seu
                  gerenciador de senhas: não vamos mostrá-lo de novo.
                </span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
