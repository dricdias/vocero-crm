"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Settings = {
  enabled: boolean;
  groupJid: string | null;
  groupName: string | null;
  reminderMinutes: number;
};
type Group = { jid: string; name: string };

const selectClass =
  "flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Avisos da equipe: escolhe o grupo de WhatsApp que recebe «atendimento
 * humano» e o lembrete de cliente sem resposta.
 */
export function TeamAlertsCard() {
  const [loaded, setLoaded] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [groupJid, setGroupJid] = useState("");
  const [savedGroupName, setSavedGroupName] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("15");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/team-alerts");
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message ?? "Não foi possível carregar os avisos da equipe.");
    const s = data.settings as Settings;
    setGroups(data.groups as Group[]);
    setGroupsError(data.groupsError as string | null);
    setAdmin(Boolean(data.canConfigure));
    setEnabled(s.enabled);
    setGroupJid(s.groupJid ?? "");
    setSavedGroupName(s.groupName);
    setMinutes(String(s.reminderMinutes));
  }, []);

  useEffect(() => {
    load()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [load]);

  const options =
    groupJid && !groups.some((g) => g.jid === groupJid)
      ? [{ jid: groupJid, name: savedGroupName ?? groupJid }, ...groups]
      : groups;

  async function call(method: "PUT" | "POST", body: unknown, ok: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/settings/team-alerts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Não foi possível concluir a operação.");
      setNotice(ok);
      if (method === "PUT") await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(minutes);
    if (!Number.isInteger(n) || n < 5 || n > 240) {
      setError("O lembrete precisa ser de 5 a 240 minutos.");
      return;
    }
    if (enabled && !groupJid) {
      setError("Escolha o grupo da equipe.");
      return;
    }
    const name = options.find((g) => g.jid === groupJid)?.name ?? null;
    void call(
      "PUT",
      { enabled, groupJid: groupJid || null, groupName: name, reminderMinutes: n },
      enabled ? "Avisos ligados. A equipe recebe os próximos atendimentos humanos no grupo." : "Avisos desligados.",
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avisos da equipe</CardTitle>
        <CardDescription>
          Quando a IA passar uma conversa para uma pessoa, o grupo da equipe recebe um aviso no WhatsApp. Se o
          cliente ficar sem resposta, chega um lembrete.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando…
          </p>
        ) : (
          <form className="space-y-4" onSubmit={save}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy || !admin}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              Avisar a equipe no WhatsApp
            </label>
            <div className="space-y-2">
              <Label htmlFor="team-alert-group">Grupo da equipe</Label>
              <select
                id="team-alert-group"
                value={groupJid}
                disabled={busy || !admin}
                onChange={(e) => setGroupJid(e.target.value)}
                className={selectClass}
              >
                <option value="">Escolha um grupo…</option>
                {options.map((g) => (
                  <option key={g.jid} value={g.jid}>
                    {g.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {groupsError ??
                  "O número conectado ao CRM precisa estar no grupo. Se o grupo não aparece, adicione o número e recarregue a página."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-alert-minutes">Lembrar se ninguém responder em (minutos)</Label>
              <Input
                id="team-alert-minutes"
                type="number"
                inputMode="numeric"
                min={5}
                max={240}
                step={1}
                value={minutes}
                disabled={busy || !admin}
                onChange={(e) => setMinutes(e.target.value)}
                className="max-w-32"
              />
              <p className="text-xs text-muted-foreground">
                Vale para conversas em atendimento humano. Resposta da IA não conta como resposta.
              </p>
            </div>
            {admin ? (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? "Aguarde…" : "Salvar avisos"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !groupJid}
                  onClick={() =>
                    void call("POST", { action: "test", groupJid }, "Mensagem de teste enviada ao grupo.")
                  }
                >
                  Enviar teste
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Somente o administrador pode alterar os avisos.</p>
            )}
          </form>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
