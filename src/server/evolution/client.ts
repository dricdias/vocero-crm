import { z } from "zod";

export const baseUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, "URL http(s) sem usuário, senha ou parâmetros")
  .transform((v) => v.replace(/\/+$/, ""));

export class EvolutionError extends Error {
  constructor(public status: number) {
    super(
      status === 401 || status === 403
        ? "O Evolution Go rejeitou o token da instância"
        : "Não foi possível concluir a operação com o Evolution Go",
    );
  }
}
export type EvolutionAccess = { baseUrl: string; token: string };

/** Única frontera HTTP del conector. Nunca propaga cuerpos con credenciales. */
export async function evolutionRequest<T extends z.ZodTypeAny>(
  access: EvolutionAccess,
  path: string,
  schema: T,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<z.infer<T>> {
  let res: Response;
  try {
    res = await fetchImpl(`${access.baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        apikey: access.token,
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new EvolutionError(0);
  }
  if (!res.ok) throw new EvolutionError(res.status);
  const parsed = z
    .object({ message: z.literal("success"), data: schema })
    .safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new EvolutionError(502);
  return parsed.data.data;
}

export const statusSchema = z.object({
  Connected: z.boolean(),
  LoggedIn: z.boolean(),
  Name: z.string().optional(),
});
export const qrSchema = z.object({
  qrcode: z.string().optional(),
  code: z.string().optional(),
  passkeyStage: z.string().optional(),
});
const sentSchema = z.object({ Info: z.object({ ID: z.string().min(1) }) });
export function getEvolutionStatus(access: EvolutionAccess) {
  return evolutionRequest(access, "/instance/status", statusSchema);
}
export async function sendEvolutionText(
  access: EvolutionAccess,
  number: string,
  text: string,
  participant?: string,
): Promise<string> {
  const sent = await evolutionRequest(access, "/send/text", sentSchema, {
    number,
    text,
    ...(participant ? { formatJid: false, mentionedJid: [participant] } : {}),
  });
  return `evo:${sent.Info.ID}`;
}
export async function sendEvolutionMedia(
  access: EvolutionAccess,
  number: string,
  type: string,
  file: { data: Buffer; mimeType: string; fileName?: string },
  caption?: string,
): Promise<string> {
  const body = new FormData();
  body.set("number", number);
  if (number.endsWith("@g.us")) body.set("formatJid", "false");
  body.set("type", type);
  if (caption) body.set("caption", caption);
  if (file.fileName) body.set("filename", file.fileName);
  body.set(
    "file",
    new Blob([new Uint8Array(file.data)], { type: file.mimeType }),
    file.fileName ?? "archivo",
  );
  const sent = await evolutionRequest(access, "/send/media", sentSchema, body);
  return `evo:${sent.Info.ID}`;
}
