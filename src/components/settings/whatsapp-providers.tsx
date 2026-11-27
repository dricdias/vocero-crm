"use client";

import { useEffect, useState } from "react";
import { EvolutionConexao, type EvolutionConnection } from "@/components/settings/evolution-conexao";
import { TeamAlertsCard } from "@/components/settings/team-alerts-card";
import { WhatsappWizard } from "@/components/settings/whatsapp-wizard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function WhatsappProviders() {
  const [provider, setProvider] = useState("meta");
  const [loaded, setLoaded] = useState(false);
  const [connection, setConnection] = useState<EvolutionConnection | null>(null);
  const [error, setError] = useState("");

  // Só decide qual provedor mostrar; a conexão em si é do `EvolutionConexao`.
  useEffect(() => {
    fetch("/api/settings/evolution")
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar a conexão Evolution Go.");
        const data = (await response.json()) as { connection: EvolutionConnection | null };
        setConnection(data.connection);
        if (data.connection) setProvider("evolution");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando conexão…
      </p>
    );
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <Label htmlFor="whatsapp-provider">Provedor de WhatsApp</Label>
        <select
          id="whatsapp-provider"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setError("");
          }}
          className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="meta">Meta — WhatsApp Cloud API</option>
          <option value="evolution">Evolution Go — conexão por QR</option>
        </select>
        <p className="text-sm text-muted-foreground">
          Desconecta el proveedor actual antes de activar el otro. Tus
          conversaciones siguen en el CRM.
        </p>
      </div>
      {provider === "meta" ? (
        <WhatsappWizard />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Evolution Go</CardTitle>
            <CardDescription>
              Usa la URL del servidor y el token de una instancia ya creada en
              Evolution Go. Este é o número principal; cada agente de área pode
              ter um número próprio em Agente → Agentes por área.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <EvolutionConexao endpoint="/api/settings/evolution" onChange={setConnection} />
            <p className="text-xs text-muted-foreground">
              Evolution Go usa una sesión vinculada al teléfono. Las plantillas
              de Meta y los indicadores de escritura no están disponibles en
              este conector. La protección de ventana del CRM sigue activa.
            </p>
          </CardContent>
        </Card>
      )}
      {provider === "evolution" && connection && <TeamAlertsCard />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
