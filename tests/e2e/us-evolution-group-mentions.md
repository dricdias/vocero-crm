# Evolution Go — grupos solo por mención

## Preparación

Conector conectado, IA habilitada, guías Agi sincronizadas. Activar `EVOLUTION_GO_GROUP_BOT_NUMBER` con el número real conectado. En gateway, no ignorar grupos. Dos participantes A y B y el agente en un grupo de prueba. No usar clientes reales para estos ensayos.

## Flujo

1. A escribe una duda sin mención: no hay respuesta ni nuevo mensaje en CRM.
2. A menciona a B: tampoco activa el agente.
3. A selecciona el contacto del agente con @ y pregunta cómo recuperar contraseña: aparece conversación `A (grupo)` y respuesta en el grupo mencionando a A, basada en guías.
4. A cita esa pregunta sin nueva mención: no dispara otro turno.
5. B menciona al agente con otra duda: conversación independiente, sin historial ni datos de A.
6. A escribe al privado del agente: el privado conserva su propio historial y funcionamiento.
7. A envía imagen con leyenda y mención: se conserva el adjunto y la pregunta en su conversación de grupo.
8. A pide humano mencionando al agente: handoff en su atención del grupo, sin pausar a B ni al privado de A.
9. Retirar variable y redeploy: nuevas menciones del grupo se ignoran; privados siguen funcionando.

## Fallos

- Sin LID verificable, una mención LID no activa al bot; no responde a terceros por aproximación.
- Repetir mismo webhook no duplica entrada ni respuesta.
- Sandbox del Laboratorio, tenant incorrecto o ventana cerrada bloquean envío como antes.
- Desconectar Evolution no permite enviar la conversación de grupo por Meta ni al número privado del participante.
