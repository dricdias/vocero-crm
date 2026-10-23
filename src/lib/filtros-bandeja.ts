/**
 * 052 — Los filtros «Sin responder» y «Por vencer» de la bandeja, y el chip
 * «Vence en…». Puros, para probarlos sin navegador.
 */

/** Margen para contestar antes de que cierre la ventana del canal. */
export const POR_VENCER_MS = 2 * 3_600_000;

type ConVentana = {
  windowOpen: boolean;
  windowRemainingMs: number;
  esperandoRespuesta: boolean;
};

/** El último mensaje es del cliente: espera respuesta. */
export function sinResponder(c: ConVentana): boolean {
  return c.esperandoRespuesta;
}

/** La ventana sigue abierta pero le quedan 2 h o menos. */
export function porVencer(c: ConVentana): boolean {
  return c.windowOpen && c.windowRemainingMs > 0 && c.windowRemainingMs <= POR_VENCER_MS;
}

/** «Vence en 1 h 20 min» / «Vence en 45 min» / «Vence en menos de 1 min». */
export function etiquetaVence(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "Vence en menos de 1 min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `Vence en ${m} min`;
  return m === 0 ? `Vence en ${h} h` : `Vence en ${h} h ${m} min`;
}
