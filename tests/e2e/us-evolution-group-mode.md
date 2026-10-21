# Cambiar el modo de respuesta del grupo

Preparar dos grupos A/B con atenciones existentes, dos participantes y agente conectado. IA activa y sin handoff. Con usuario administrador:

1. Abrir atención del grupo A en Bandeja y abrir detalles. Respostas neste grupo muestra Menções e respostas ao agente.
2. Elegir Todas as mensagens do grupo y Guardar. Confirma guardado; recargar mantiene selección.
3. Enviar pregunta en A sin @: entra y recibe respuesta. Otro participante pregunta: atención independiente.
4. En B sin preferencia, mensaje sin @ no activa al agente; @ y Responder siguen funcionando. Privado sin cambios.
5. Volver A a Menções e respostas ao agente, Guardar y enviar pregunta sin @: no entra. @ o Responder a una salida del agente del mismo atendimento sí entra.
6. Poner una atención en handoff: cambiar modo no la reactiva. No se ingesta historial antiguo ni se cancela una respuesta ya en procesamiento.
7. Usuario miembro consulta el modo, sin botón Guardar. PATCH manual devuelve 403. Conversación de otro tenant, privada o laboratorio devuelve 404.
8. Simular fallo de carga/guardado: error anunciado y recuperación disponible; no afirmar que se guardó sin confirmación del servidor.

Repetir controles en móvil con panel lateral abierto, teclado y tema oscuro. El primer Deploy aplica la migración 0022; después alternar modos no requiere nuevo Deploy.
