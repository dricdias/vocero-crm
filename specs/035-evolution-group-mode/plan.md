# Plan

1. Añadir `evolution_group_settings`: id, organization_id con FK, group_jid, reply_mode (`mentions` por defecto; check mentions/all) y updated_at. Índice único de organización y grupo. Generar SQL y snapshot con drizzle-kit; ningún cambio destructivo.
2. Repositorio de lectura sin cache para que cada mensaje nuevo observe la preferencia guardada. Falta de fila o valor desconocido conserva menciones. Upsert con clave compuesta y organización explícita.
3. Ruta interna por conversación para consultar/guardar la preferencia derivando grupo desde la identidad almacenada, no desde un JID suministrado por el navegador. La lógica vive en servidor y la ruta solo exporta handlers.
4. Webhook consulta el modo solo con grupos activados, evento entrante válido y número configurado. En all evita consultas de alias innecesarias; menciones/respuestas mantienen sus verificaciones.
5. Panel de conversación usa tokens y controles radio nativos con botón Guardar, lectura para miembros y estados accesibles. El indicador de grupo viaja en el DTO interno, sin tocar los contratos /api/bot ni despacho.
6. Pruebas de repositorio, handler, transición all→mentions, guardas existentes, UI desktop/mobile y cuatro gates; CI con opcionales apagados y encendidos.
