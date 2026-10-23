/*
 * 048 — Service worker de la app instalable.
 *
 * Mínimo a propósito. NO guarda nada: ni páginas ni datos de clientes en el
 * dispositivo. Un CRM que enseña conversaciones viejas como si fueran actuales
 * es peor que uno que dice «sin conexión», y un celular se pierde.
 *
 * Hace tres cosas:
 *   1. se activa enseguida, sin esperar a que se cierren las pestañas viejas;
 *   2. si una NAVEGACIÓN falla por falta de red, responde la página de abajo;
 *   3. todo lo demás (API, SSE, adjuntos, assets) ni lo toca: va a la red.
 *
 * White-label: la página no lleva el nombre de nadie.
 */

const PAGINA_SIN_CONEXION = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sin conexión</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --text: #0a1730; --muted: #4b5875; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0b1327; --text: #e8eefb; --muted: #a7b3cc; } }
  html, body { height: 100%; margin: 0; }
  body { display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box;
         background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 22rem; text-align: center; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { margin: 0 0 1.25rem; color: var(--muted); }
  button { font: inherit; font-weight: 600; padding: .6rem 1.2rem; border-radius: 10px; border: 0;
           /* El mismo azul en los dos temas: con blanco encima pasa AA (5,3:1). */
           background: #0d5bff; color: #ffffff; cursor: pointer; }
</style>
</head>
<body>
<main>
  <h1>Sin conexión</h1>
  <p>No hay internet en este momento. Tus conversaciones siguen guardadas en el servidor y aparecen en cuanto vuelva la red.</p>
  <button type="button" onclick="location.reload()">Reintentar</button>
</main>
</body>
</html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Solo navegaciones: el resto sigue su camino sin pasar por aquí.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(PAGINA_SIN_CONEXION, {
          status: 503,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        })
    )
  );
});
