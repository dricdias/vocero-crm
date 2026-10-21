# Verificación — 20 de octubre de 2026

- `pnpm typecheck`: correcto.
- `pnpm lint`: correcto.
- `pnpm test`: 1216 tests correctos en la primera corrida; se añadieron después tres casos de configuración y rechazo de eventos.
- Con `EVOLUTION_GO=on`, número de prueba, `AGI_SUPPORT=on`, `AGENDA=on` y todos los canales: 1219 tests correctos, 108 archivos.
- `pnpm build`: correcto tras el último cambio de implementación.
- 12 casos nuevos de grupos; tests existentes de envío ampliados para grupo/participante y bloqueo de fallback a Meta.
- Fuente primaria revisada: `evolution-foundation/evolution-go`, commit `9337afc47e10b86cc896a6f432240e40fee95dd1`: rutas `/user/info`, `/send/text`, campos `Users.*.LID`, `mentionedJid` (array), `formatJid`, filtros `IgnoreGroups` y `EVENT_IGNORE_GROUP`. El status no expone `myJid`; por eso el número propio se configura explícitamente.
- No se enviaron mensajes reales. Pendiente tras deploy: configurar el número, confirmar que el gateway entrega grupos y realizar el guion con usuarios de prueba.
