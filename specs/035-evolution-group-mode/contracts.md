# API interna

`GET /api/conversations/:id/group-mode`: sesión y organización. 200 `{mode:"mentions"|"all", available:boolean, canConfigure:boolean}`. `available` indica si está configurado el número del agente. 404 con conector apagado, conversación ajena, privada, de laboratorio o sin conexión Evolution guardada.

`PATCH /api/conversations/:id/group-mode`: body Zod estricto `{mode:"mentions"|"all"}`. Solo owner/admin; 403 para miembros. El grupo se deriva de la conversación de esa organización. 409 sin configuración de grupos; 422 con body inválido; 200 con la forma del GET tras guardar. Publica conversation.updated sin secretos. No cambia el toggle de IA ni el handoff.

Almacenamiento: `evolution_group_settings`, org NOT NULL + FK cascade, unique(org,group_jid), default mentions, check mentions/all. Migración generada 0022. No hay filas semilla: las instalaciones existentes conservan menciones por ausencia de preferencia.
