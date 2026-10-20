"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Info,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Connection = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
};

type WebhookInfo = {
  url: string;
  verifyToken: string;
  isHttps: boolean;
  signatureLayer: boolean;
};

/** Lo que devuelve el registro del webhook en Meta (al guardar o a demanda). */
type WebhookRegistration =
  | { ok: true; appWithoutWebhook: boolean }
  | { ok: true; skipped: "waba_override"; host: string }
  | { ok: false; message: string };

/**
 * El último registro, y desde dónde se pidió. Uno solo para las dos tarjetas:
 * con uno por tarjeta, guardar con un token sin permiso dejaba el «registrado»
 * de un clic anterior al lado del aviso nuevo.
 */
type LastRegistration = { result: WebhookRegistration; from: "save" | "button" };

export function WhatsappWizard() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [registration, setRegistration] = useState<LastRegistration | null>(
    null
  );

  const refetch = useCallback(async () => {
    const [c, w] = await Promise.all([
      fetch("/api/settings/whatsapp").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/settings/webhook").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (c) setConnection(c.connection);
    if (w) setWebhook(w);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex flex-wrap items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-[12rem] flex-1">
            <p className="font-medium text-danger-text">
              O token do WhatsApp expirou ou foi revogado.
            </p>
            <p className="text-danger-text opacity-80">
              Os envios estão pausados. Cole um token novo abaixo e teste a
              conexão para reconectar.
            </p>
          </div>
          <Desconectar
            onHecho={() => {
              setRegistration(null);
              void refetch();
            }}
          />
        </div>
      )}

      {connection && connection.status === "connected" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="min-w-[12rem] flex-1 text-sm">
            <p className="font-medium text-success-text">
              Número conectado: {connection.displayPhoneNumber ?? connection.phoneNumberId}
            </p>
            <p className="text-success-text opacity-80">
              {connection.verifiedName ? `${connection.verifiedName} · ` : ""}
              token …{connection.tokenLast4}
            </p>
          </div>
          <Badge variant="success">Conectado</Badge>
          <Desconectar
            onHecho={() => {
              setRegistration(null);
              void refetch();
            }}
          />
        </div>
      )}

      <ConnectForm
        existing={connection}
        registration={registration?.from === "save" ? registration.result : null}
        onRegistration={(result) =>
          setRegistration(result ? { result, from: "save" } : null)
        }
        onSaved={() => void refetch()}
      />

      {webhook && (
        <WebhookCard
          webhook={webhook}
          connection={connection}
          registration={registration?.from === "button" ? registration.result : null}
          onRegistration={(result) =>
            setRegistration(result ? { result, from: "button" } : null)
          }
        />
      )}
    </div>
  );
}

/**
 * Soltar el número.
 *
 * Pide confirmación porque corta la entrada y la salida de mensajes al
 * instante — no es un ajuste, es apagar el canal. Lo que NO hace es borrar la
 * bandeja, y el aviso lo dice: sin eso, nadie se atreve a tocarlo.
 */
function Desconectar({ onHecho }: { onHecho: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function desconectar() {
    setYendo(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/whatsapp", { method: "DELETE" });
      if (res.ok) {
        setConfirmando(false);
        onHecho();
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(data?.error?.message ?? "Não foi possível desconectar o número.");
      }
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setYendo(false);
    }
  }

  if (!confirmando) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirmando(true)}>
        Desconectar
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        Você deixará de receber e enviar. Suas conversas são mantidas.
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={yendo}
        onClick={() => setConfirmando(false)}
      >
        Cancelar
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={yendo}
        onClick={() => void desconectar()}
      >
        {yendo ? "Desconectando…" : "Sim, desconectar"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

function ConnectForm({
  existing,
  registration,
  onRegistration,
  onSaved,
}: {
  existing: Connection | null;
  registration: WebhookRegistration | null;
  onRegistration: (result: WebhookRegistration | null) => void;
  onSaved: () => void;
}) {
  const [wabaId, setWabaId] = useState(existing?.wabaId ?? "");
  const [phoneNumberId, setPhoneNumberId] = useState(
    existing?.phoneNumberId ?? ""
  );
  const [token, setToken] = useState("");
  const [testResult, setTestResult] = useState<
    | { ok: true; display: string }
    | { ok: false; message: string }
    | null
  >(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canTest = wabaId.trim() && phoneNumberId.trim() && token.trim();

  async function test() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/settings/whatsapp/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumberId, token }),
    }).catch(() => null);
    setTesting(false);
    if (!res) {
      setTestResult({ ok: false, message: "Sem conexão com o servidor" });
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      displayPhoneNumber?: string;
      error?: { message?: string };
    } | null;
    if (res.ok && data?.displayPhoneNumber) {
      setTestResult({ ok: true, display: data.displayPhoneNumber });
    } else {
      setTestResult({
        ok: false,
        message: data?.error?.message ?? "A validação falhou",
      });
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    onRegistration(null);
    const res = await fetch("/api/settings/whatsapp", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wabaId, phoneNumberId, token }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSaveError(data?.error?.message ?? "Não foi possível salvar a conexão");
      return;
    }
    const saved = (await res.json().catch(() => null)) as {
      webhook?: WebhookRegistration;
    } | null;
    onRegistration(saved?.webhook ?? null);
    setToken("");
    setTestResult(null);
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {existing ? "Reconectar / atualizar o número" : "Conectar seu número de WhatsApp"}
        </CardTitle>
        <CardDescription>
          Cole as credenciais da WhatsApp Cloud API. O token é validado
          na Meta ANTES de ser salvo e fica armazenado criptografado. Ao salvar, o
          webhook é registrado na Meta para você.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-md border bg-background p-4 text-sm">
          <p className="font-medium">De onde vem o token?</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="mb-1 font-medium text-primary">Modo direto</p>
              <p className="text-muted-foreground">
                O negócio tem seu próprio app em{" "}
                <span className="text-foreground">developers.facebook.com</span>:
                use um token de <span className="text-foreground">usuário do sistema</span>{" "}
                (não expira) com permissões de WhatsApp. Neste modo convém
                configurar também o App Secret para a assinatura do webhook.
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="mb-1 font-medium text-primary">Modo agência (Tech Provider)</p>
              <p className="text-muted-foreground">
                Sua agência faz o Embedded Signup na plataforma DELA e o
                backend dela obtém o token do cliente; ela entrega para você
                colar aqui. Ao salvar, o webhook é registrado no número
                (<span className="text-foreground">override do número</span>),
                igual ao modo direto; se sua agência já roteia a conta para
                o próprio backend, isso é respeitado.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="waba-id">WABA ID</Label>
            <Input
              id="waba-id"
              placeholder="ID da conta do WhatsApp Business"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone-number-id">Phone Number ID</Label>
            <Input
              id="phone-number-id"
              placeholder="ID do número de telefone"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="token">Token de acesso</Label>
          <Input
            id="token"
            type="password"
            placeholder={existing ? `Salvo (…${existing.tokenLast4}) — cole um novo para trocá-lo` : "EAAG…"}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setTestResult(null);
            }}
          />
        </div>

        {testResult && (
          <p
            className={`text-sm ${testResult.ok ? "text-success" : "text-destructive"}`}
          >
            {testResult.ok
              ? `✓ Token válido para ${testResult.display}. Você já pode salvar.`
              : testResult.message}
          </p>
        )}
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        {registration && (
          <RegistrationNotice registration={registration} afterSave />
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!canTest || testing}
            onClick={() => void test()}
          >
            {testing ? "Testando…" : "Testar conexão"}
          </Button>
          <Button
            disabled={!testResult?.ok || saving}
            onClick={() => void save()}
          >
            {saving ? "Salvando…" : "Salvar conexão"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * El resultado de registrar el webhook en Meta, en palabras de quien lo lee.
 *
 * Un fallo aquí NO deshace el guardado: el token es válido y la conexión
 * envía. Por eso el aviso es de advertencia, no de error, y dice qué hacer.
 */
function RegistrationNotice({
  registration,
  afterSave = false,
}: {
  registration: WebhookRegistration;
  afterSave?: boolean;
}) {
  if (registration.ok && "skipped" in registration) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Sua conta do WhatsApp já roteia os webhooks para{" "}
          <span className="text-foreground">{registration.host}</span> (un
          cérebro externo ou o backend da sua agência). Isso é respeitado: o número
          fica sem webhook próprio e as mensagens continuam chegando lá.
        </span>
      </p>
    );
  }
  if (registration.ok && !registration.appWithoutWebhook) {
    return (
      <p className="flex items-start gap-2 text-sm text-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        Webhook registrado na Meta: as mensagens deste número chegam aqui.
        Não é preciso colar nada no painel do seu app.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-xs text-warning-text">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {registration.ok ? (
          <>
            Webhook registrado no número, mas a Meta não informa nenhum
            webhook no seu app. Se as mensagens não chegarem: em developers.facebook.com
            → seu app → WhatsApp → Configuração, verifique uma callback URL
            (a de baixo serve) e assine o campo{" "}
            <code>messages</code>. É uma vez só por app.
          </>
        ) : (
          <>
            {afterSave ? "A conexão foi salva, mas não" : "Não"} conseguimos
            registrar o webhook na Meta. {registration.message} Tente de novo com
            «Registrar na Meta» ou cole a URL e o verify token manualmente.
          </>
        )}
      </span>
    </p>
  );
}

function WebhookCard({
  webhook,
  connection,
  registration,
  onRegistration,
}: {
  webhook: WebhookInfo;
  connection: Connection | null;
  registration: WebhookRegistration | null;
  onRegistration: (result: WebhookRegistration | null) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const canRegister = connection?.status === "connected";

  async function register() {
    setRegistering(true);
    onRegistration(null);
    const res = await fetch("/api/settings/webhook", { method: "POST" }).catch(
      () => null
    );
    const data = (await res?.json().catch(() => null)) as
      | (WebhookRegistration & { error?: { message?: string } })
      | null;
    setRegistering(false);
    if (res?.ok && data?.ok) {
      onRegistration(data);
    } else {
      onRegistration({
        ok: false,
        message: data?.error?.message ?? "Sem conexão com o servidor.",
      });
    }
  }

  function copy(text: string, which: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook de WhatsApp</CardTitle>
        <CardDescription>
          Ao salvar a conexão, este endereço é registrado na Meta para você, no
          número (override). Estes valores são para o backend da sua agência
          ou para colar manualmente no painel da Meta só se o registro
          automático falhar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canRegister && (
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              disabled={registering}
              onClick={() => void register()}
            >
              {registering ? "Registrando…" : "Registrar na Meta"}
            </Button>
            {registration && <RegistrationNotice registration={registration} />}
          </div>
        )}
        {!webhook.isHttps && (
          <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-xs text-warning-text">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A URL configurada não é https: a Meta exige https para webhooks.
            Ajuste APP_BASE_URL com seu domínio público.
          </p>
        )}
        <div className="space-y-1.5">
          <Label>URL do webhook (callback URL)</Label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-2 text-xs">
              {webhook.url}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copiar URL"
              onClick={() => copy(webhook.url, "url")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {copied === "url" && (
              <span className="text-xs text-primary">Copiada ✓</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            A URL contém o token secreto no caminho: trate-a como uma
            senha.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Verify token</Label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-2 text-xs">
              {webhook.verifyToken}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copiar verify token"
              onClick={() => copy(webhook.verifyToken, "vt")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            {copied === "vt" && (
              <span className="text-xs text-primary">Copiado ✓</span>
            )}
          </div>
        </div>
        {webhook.signatureLayer ? (
          <p className="flex items-center gap-2 text-xs text-success">
            <ShieldCheck className="h-4 w-4" /> Verificação de assinatura ativa
            (META_APP_SECRET configurado): cada evento é validado com
            x-hub-signature-256.
          </p>
        ) : (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" /> Sem App Secret
            configurado: o webhook fica protegido pela URL secreta (normal
            no modo agência). Para a camada extra de assinatura, adicione
            META_APP_SECRET à instância.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
