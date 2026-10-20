# 032 — Central de Ajuda do Agi como fonte do agente

Carril completo: se publica un contrato de lectura en el Agi. No hay migraciones ni modificaciones del contrato bot/SSE existente del CRM.

## Problema y comportamiento
El responsable quiere que el agente de WhatsApp del CRM responda usando los mismos guías editoriales de la Central de Ayuda del Agi. La fuente son exclusivamente los artículos del código, nunca conversaciones, cuentas, contraseñas ni datos de clientes.

- Fuente opcional apagada por defecto: AGI_SUPPORT=on, AGI_SUPPORT_URL y AGI_SUPPORT_TOKEN en runtime.
- Agi publica JSON editorial versionado en una ruta dedicada, con token exclusivo de lectura; sin token configurado, 404, y con autenticación incorrecta, 401.
- CRM verifica y cachea un snapshot válido durante 5 minutos; selecciona hasta cinco guías relevantes para cada pregunta. Máximo 18.000 caracteres adicionales por turno.
- Sin fuente disponible, conserva una copia válida por hasta una hora; después usa solo la base local y el agente debe confirmar con una persona lo que no sabe. Un fallo externo nunca pierde mensajes ni bloquea el CRM.
- La UI de Agente indica estado y cantidad de guías sin mostrar secretos. Laboratorio y perfil del bot incluyen la misma fuente para evaluar/responder coherentemente.
- Cambiar o desactivar esta fuente no cambia entradas manuales de la base ni datos de conversaciones.

## Aceptación
Pruebas de contrato, autenticación, límites, caché, selección, fallos y composición del prompt. Flags apagadas sin llamadas externas. Tipos, lint, pruebas y build. Configuración y prueba real de ambos despliegues quedan pendientes de los secretos runtime.

## Fuera de alcance
No se leen los chats privados de soporte ni datos de una cuenta; no se ejecutan acciones sobre el Agi; no se entrenan modelos ni se añaden buscadores o bases vectoriales externos.
