# Verificación — 20 de octubre de 2026

- `pnpm typecheck`: correcto.
- `pnpm lint`: correcto.
- `pnpm test`: 1216 tests correctos en la primera corrida; se añadieron después tres casos de configuración y rechazo de eventos.
- Con `EVOLUTION_GO=on`, número de prueba, `AGI_SUPPORT=on`, `AGENDA=on` y todos los canales: 1219 tests correctos, 108 archivos.
- `pnpm build`: correcto tras el último cambio de implementación.
- 12 casos nuevos de grupos; tests existentes de envío ampliados para grupo/participante y bloqueo de fallback a Meta.
- Fuente primaria revisada: `evolution-foundation/evolution-go`, commit `9337afc47e10b86cc896a6f432240e40fee95dd1`: rutas `/user/info`, `/send/text`, campos `Users.*.LID`, `mentionedJid` (array), `formatJid`, filtros `IgnoreGroups` y `EVENT_IGNORE_GROUP`. El status no expone `myJid`; por eso el número propio se configura explícitamente.
- No se enviaron mensajes reales. Pendiente tras deploy: configurar el número, confirmar que el gateway entrega grupos y realizar el guion con usuarios de prueba.

## Corrección del reconocimiento LID

Diagnóstico real del servidor: conexión activa, número configurado correcto, sin filtro global de grupos. `/user/info` agotó el tiempo; `/user/check` respondió 200, confirmó el número propio y devolvió LID. No había atendimientos de grupo en CRM. Se reemplazó la consulta de perfil por la comprobación de número, enviando `formatJid: false` y validando `Users[].JID`, `IsInWhatsapp` y `LID` con Zod. No se acepta LID de otro número ni número no confirmado.

Reproducción: `pnpm exec vitest run tests/unit/evolution-groups.test.ts` falló en la ingesta de una mención LID cuando `/user/info` daba timeout y `/user/check` estaba disponible. Tras la corrección, los 14 tests del archivo pasan; incluyen cache concurrente y rechazo de número no confirmado. La prueba real del grupo se repite después del deploy; no se han enviado mensajes de WhatsApp desde el entorno local.
