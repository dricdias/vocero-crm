"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Conexão de uma instância do Evolution Go: URL + token, QR, estado e
 * desvincular. Serve ao número principal (Configurações → WhatsApp) e ao
 * número próprio de um agente de área — muda só o `endpoint`.
 */

export type EvolutionConnection = {
  baseUrl: string;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
};

export function EvolutionConexao({
  endpoint,
  onChange,
  baseUrlSugerida,
}: {
  endpoint: string;
  onChange?: (c: EvolutionConnection | null) => void;
  /** Para o número de um agente: a URL do servidor do principal. */
  baseUrlSugerida?: string;
}) {
  const id = useId();
  const [loaded, setLoaded] = useState(false);
  const [connection, setConnection] = useState<EvolutionConnection | null>(
    null,
  );
  const [baseUrl, setBaseUrl] = useState(baseUrlSugerida ?? "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(endpoint);
    if (!response.ok)
      throw new Error("Não foi possível carregar a conexão Evolution Go.");
    const data = (await response.json()) as {
      connection: EvolutionConnection | null;
    };
    setConnection(data.connection);
    if (data.connection) setBaseUrl(data.connection.baseUrl);
    onChange?.(data.connection);
    return data.connection;
  }, [endpoint, onChange]);

  useEffect(() => {
    refresh()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [refresh]);

  async function run(method: string, body?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message ?? "Não foi possível concluir a operação.",
        );
      if (method === "PUT") {
        setToken("");
        setQr(null);
        setCode(null);
        setNotice(
          "Conexão salva. Consulte o estado ou gere o QR para vincular o telefone.",
        );
      }
      if (method === "DELETE") {
        setToken("");
        setBaseUrl(baseUrlSugerida ?? "");
        setQr(null);
        setCode(null);
        setNotice(
          "Evolution Go desvinculado do CRM. O histórico foi preservado.",
        );
      }
      if (body && typeof body === "object" && "action" in body) {
        if (body.action === "qr") {
          setQr(data.qrcode);
          setCode(data.code);
          setNotice(
            data.qrcode || data.code
              ? "No WhatsApp, abra Aparelhos conectados para vincular este dispositivo."
              : "QR indisponível. Consulte o estado; se houver passkey pendente, conclua no painel Evolution Go.",
          );
        } else {
          setNotice(
            data.connected
              ? "WhatsApp conectado pelo Evolution Go."
              : "Telefone desconectado. Gere um QR para conectar.",
          );
          if (data.connected) {
            setQr(null);
            setCode(null);
          }
        }
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na conexão.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando conexão…
      </p>
    );

  return (
    <div className="space-y-5">
      {connection && (
        <p className="text-sm">
          {connection.status === "connected"
            ? "Conectado"
            : "Aguardando conexão do telefone"}{" "}
          · Token terminado em {connection.tokenLast4}
        </p>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run("PUT", { baseUrl, token });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor={`${id}-url`}>URL do Evolution Go</Label>
          <Input
            id={`${id}-url`}
            type="url"
            placeholder="https://evolution.exemplo.com"
            required
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            URL raiz, sem rotas como /instance ou /send.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-token`}>Token da instância</Label>
          <Input
            id={`${id}-token`}
            type="password"
            autoComplete="new-password"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            Use o token da instância, não a chave global do administrador.
          </p>
        </div>
        <Button type="submit" disabled={busy}>
          {busy
            ? "Aguarde…"
            : connection
              ? "Salvar nova credencial"
              : "Salvar e configurar webhook"}
        </Button>
      </form>
      {connection && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run("POST", { action: "qr" })}
          >
            Gerar QR
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run("POST", { action: "status" })}
          >
            Consultar estado
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run("DELETE")}
          >
            Desvincular do CRM
          </Button>
        </div>
      )}
      {qr && (
        <div className="max-w-xs rounded-lg border bg-background p-3">
          <Image
            unoptimized
            src={qr}
            alt="QR para vincular o WhatsApp ao Evolution Go"
            width={280}
            height={280}
            className="h-auto w-full"
          />
        </div>
      )}
      {code && (
        <p className="break-all text-sm">
          Código de pareamento: <span className="font-mono">{code}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
