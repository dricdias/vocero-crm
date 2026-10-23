/**
 * Self-test E2E — 052: filtros «Sin responder» y «Por vencer».
 * Guion: tests/e2e/us-filtros-ventana.md.
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true. `E2E_EMAIL` / `E2E_PASSWORD`
 * para entrar con una cuenta que ya exista (si no, se crea).
 *
 * Uso: node --env-file=<env> scripts/e2e-filtros-ventana.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e-filtros@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-filtros";
const S = Date.now().toString(36);
const PN = `PN-FIL-${S}`;
const H = 3600;

let failures = 0;
let checks = 0;
function ok(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FALLA  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 15000) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > fin) return v;
    await espera(250);
  }
}

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const api = (p, init = {}) => ctx.request.fetch(`${BASE}${p}`, { ...init, headers: { origin: BASE, ...(init.headers ?? {}) } });

try {
  console.log("== Preparación ==");
  let r = await api("/api/auth/sign-up/email", { method: "POST", data: { email: EMAIL, password: PASSWORD, name: "Dueña" } });
  if (!r.ok()) r = await api("/api/auth/sign-in/email", { method: "POST", data: { email: EMAIL, password: PASSWORD } });
  ok("login", r.ok());
  await api("/api/settings/whatsapp", { method: "PUT", data: { wabaId: "WABA-FIL", phoneNumberId: PN, token: "tok-fil" } });

  const lista = async () => (await (await api("/api/conversations")).json()).conversations ?? [];
  const yaHabiaPorVencer = (await lista()).some((c) => c.windowOpen && c.windowRemainingMs <= 2 * H * 1000);

  const page = await ctx.newPage();
  await page.goto(`${BASE}/inbox`);
  const boton = (nombre) => page.getByRole("button", { name: new RegExp(`^${nombre}\\s*\\d+$`) });
  await boton("Todas").waitFor();
  if (!yaHabiaPorVencer) {
    console.log("\n== AC4 · sin ninguna por vencer no hay botón ==");
    ok("«Por vencer» no se pinta", (await boton("Por vencer").count()) === 0);
  } else {
    console.log("  ·  la base ya tiene conversaciones por vencer: se salta AC4");
  }

  const AHORA = `Espera ahora ${S}`;
  const NOTA = `Espera con nota ${S}`;
  const VENCE = `Por vencer ${S}`;
  const CERRADA = `Ya cerrada ${S}`;
  const rnd = () => Math.floor(1000 + Math.random() * 8999);
  const ahora = Math.floor(Date.now() / 1000);
  for (const [name, ts, pref] of [
    [AHORA, ahora, "5215557"],
    [NOTA, ahora, "5215558"],
    [VENCE, ahora - (22 * H + 30 * 60), "5215559"],
    [CERRADA, ahora - 30 * H, "5215550"],
  ]) {
    await api("/api/dev/wa-mock/inbound", { method: "POST", data: { phoneNumberId: PN, from: `${pref}${rnd()}${rnd()}`.slice(0, 13), name, text: `hola ${S}`, timestamp: ts } });
  }
  const convs = await hasta(async () => {
    const l = await lista();
    const m = Object.fromEntries([AHORA, NOTA, VENCE, CERRADA].map((n) => [n, l.find((c) => c.contact.name === n)]));
    return Object.values(m).every(Boolean) ? m : null;
  });
  ok("las cuatro conversaciones existen", Boolean(convs));
  ok("el DTO trae esperandoRespuesta", convs[AHORA].esperandoRespuesta === true, JSON.stringify(convs[AHORA]).slice(0, 80));

  await page.reload();
  await boton("Todas").waitFor();
  const filas = () => page.locator("li").filter({ has: page.locator("button") });
  const enLista = async (nombre) => (await page.getByRole("button").filter({ hasText: nombre }).count()) > 0;

  console.log("\n== AC1 · sin responder ==");
  await boton("Sin responder").click();
  ok("«Espera ahora» está en Sin responder", Boolean(await hasta(() => enLista(AHORA), 10000)));
  await api(`/api/conversations/${convs[AHORA].id}/messages`, { method: "POST", data: { text: `ya te atiendo ${S}` } });
  await hasta(async () => !(await enLista(AHORA)), 10000);
  ok("al contestarle, sale de Sin responder", !(await enLista(AHORA)));

  console.log("\n== AC2 · una nota no cuenta como respuesta ==");
  r = await api(`/api/conversations/${convs[NOTA].id}/notes`, { method: "POST", data: { texto: `revisar stock ${S}` } });
  ok("se escribió la nota", r.status() === 201);
  await espera(1500);
  ok("sigue en Sin responder", await enLista(NOTA));

  console.log("\n== AC3 · por vencer ==");
  await boton("Por vencer").waitFor({ timeout: 10000 }).catch(() => {});
  ok("aparece el botón «Por vencer»", (await boton("Por vencer").count()) === 1);
  await boton("Por vencer").click();
  ok("la de hace 22 h 30 min está", await enLista(VENCE));
  ok("la de recién no", !(await enLista(NOTA)));
  ok("la ya cerrada no", !(await enLista(CERRADA)));
  const fila = page.getByRole("button").filter({ hasText: VENCE }).first();
  const chip = (await fila.locator("[data-vence]").innerText().catch(() => "")).trim();
  ok("la fila dice «Vence en 1 h 2x/3x min»", /^Vence en 1 h \d{1,2} min$/.test(chip), chip);
  await espera(400); // la transición del botón elegido
  await page.screenshot({ path: ".tmp/e2e-052-por-vencer.png" });

  console.log("\n== AC5 · se combinan con la búsqueda ==");
  await page.getByPlaceholder("Buscar por nombre o teléfono").fill(`Ya cerrada ${S}`);
  await espera(400);
  ok("Por vencer + buscar una cerrada → vacío", !(await enLista(VENCE)) && !(await enLista(CERRADA)));
  await page.getByPlaceholder("Buscar por nombre o teléfono").fill("");
  await boton("Todas").click();
  ok("el chip se ve también sin el filtro", (await page.getByRole("button").filter({ hasText: VENCE }).first().locator("[data-vence]").count()) === 1);

  console.log("\n== AC6 · celular ==");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  // Con la lista ya pintada: con todos los filtros es cuando la fila envuelve.
  await page.getByRole("button").filter({ hasText: VENCE }).first().waitFor({ timeout: 20000 });
  await boton("Por vencer").waitFor();
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok("a 390 px la fila de filtros envuelve sin desplazamiento horizontal", !desborde);
  await page.screenshot({ path: ".tmp/e2e-052-390.png" });
  void filas;
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
