# 035 — Modo de respuesta por grupo

El administrador quiere comparar responder a todo el grupo con el modo actual de menciones y respuestas directas, desde el CRM y sin redeploy en cada prueba.

## Criterios

- En los detalles de una conversación real de Evolution Go se muestra Respostas neste grupo, con las opciones `mentions` y `all` y una acción explícita para guardar. `mentions` es el valor por defecto y conserva el comportamiento de 033/034.
- La preferencia es común a los participantes de ese grupo y aislada por organización y JID de grupo; no se aplica globalmente ni se infiere del nombre de contacto.
- `all` permite nuevas entradas del grupo sin @; no admite ecos propios ni JID/remitente inválido. Los mensajes pasan por la misma ingesta idempotente, pipeline y guardas. No se mezclan historiales entre participantes.
- `mentions` continúa aceptando menciones y respuestas directas confirmadas a una salida IA del propio atendimento. Cambiar de modo no reingesta mensajes pasados ni cancela turnos aceptados antes del cambio.
- El miembro puede consultar; solo owner/admin puede guardar. El servidor valida rol, organización, conversación real y grupo. No se entregan credenciales al cliente.
- La UI muestra carga, error recuperable, modo pendiente y confirmación del guardado; no necesita reconectar la instancia. El modo no reactiva IA pausada ni handoff.
- El módulo sigue detrás de EVOLUTION_GO, apagado por defecto, y del número configurado para grupos. La migración se aplica incluso con la bandera apagada.
