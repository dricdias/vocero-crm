# 033 — Grupos de Evolution Go por mención

Solicitud: atender dudas de clientes en grupos solo al mencionar al agente. Opcional dentro del conector Evolution; apagado sin `EVOLUTION_GO_GROUP_BOT_NUMBER` válido y `EVOLUTION_GO=on`.

## Criterios

- Solo `Info.IsGroup` con JID `@g.us`, remitente válido y `contextInfo.mentionedJID` del bot activa la ingesta. Se ignoran ecos, grupos sin mención y menciones citadas o dirigidas a terceros.
- La identidad del bot es el número configurado. Los alias LID se confirman con `/user/check` del propio número, nunca se presupone que cualquier mención convoca al bot.
- Cada grupo + participante tiene una identidad `evo-group:<group>:<sender>`, sin teléfono ni reconciliación con contactos individuales. Usa el flujo existente de ingesta, deduplicación, coalesce, handoff y ventana.
- `channelThreadRef` contiene el JID de grupo. El remitente recibe la respuesta dentro del grupo, mencionado; nunca se envía al privado por accidente ni se deriva a Meta.
- No hay migración: se reutilizan identidad opaca y threadRef existentes. El cuerpo del despacho y las rutas públicas no cambian. Bots externos deben tratar la nueva identidad como opaca; los envíos por conversación conservan el destino.
- El prompt declara contexto público y limita el historial a las menciones de ese participante. El conocimiento editorial del Agi continúa disponible.

## Plan y límites

Módulo `evolution/groups.ts` para identidad/configuración y alias con cache acotado por credencial. Parser puro para probar la decisión antes de cualquier IO. Única salida por `inbox/send.ts` conserva guardas y dirige el destinatario al JID del grupo. No se importa historial ni se leen conversaciones sin mención. No se modifican automáticamente los filtros del gateway. El número configurado debe corresponder a la instancia conectada de esta instalación (un negocio por instancia).

## Verificación

Tests de parser, entrada por webhook simulado y salida por la puerta real del CRM. Regresión de privados, ecos, sandbox, tenant y ventana. Cuatro gates del proyecto; CI opcionales apagados/encendidos. Guion de aceptación en `tests/e2e/us-evolution-group-mentions.md`. Prueba real requiere despliegue y un participante de WhatsApp.
