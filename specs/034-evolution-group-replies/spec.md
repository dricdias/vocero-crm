# 034 — Continuar el grupo con Responder

Después de iniciar el atendimento por @, un participante puede usar Responder sobre una salida del agente dirigida a él sin repetir la mención. Amplía el criterio de entrada de 033; las demás guardas permanecen.

El webhook obtiene `stanzaID` del `contextInfo` del contenido actual o de `data.quoted`, formato normalizado del Evolution Go. Nunca acepta el texto de `quotedMessage` como prueba. La confirmación consulta el ID persistido `evo:<stanzaID>` y exige salida de IA, organización coincidente en mensaje/conversación/contacto, conversación real de WhatsApp, grupo y participante exactos. Respuestas ajenas, IDs desconocidos, ecos y grupos sin activar siguen ignorados. Una mención explícita conserva su comportamiento.

La respuesta nueva pasa por la misma ingesta y conserva historial, deduplicación, coalesce, handoff y ventana. No agrega columnas, no migra datos ni cambia el contrato público. No necesita variables nuevas. El prompt del grupo reconoce las dos formas de convocación.

Verificación: pruebas de ambas formas de cita, rechazo de referencia desconocida y grupos apagados; consulta SQL con scope de organización y comprobaciones de grupo, participante, salida de IA y sandbox. Ensayo real después del deploy: @agente pregunta; el agente pide aclaración; el mismo participante responde mediante Responder sin @ y recibe continuación.
