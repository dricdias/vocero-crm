# 031 — Conector opcional Evolution Go

Carril completo: tabla de credenciales y webhook público nuevos. Solicitud del responsable del fork: ofrecer Evolution Go además de Meta.

## Comportamiento y aceptación
- Con EVOLUTION_GO=on, Ajustes → WhatsApp permite elegir Meta o Evolution Go; apagada, la opción desaparece y su API responde 404.
- Una organización tiene un único transporte activo. Para cambiarlo debe desconectar el anterior; no se borran contactos ni mensajes.
- El administrador registra URL y token de una instancia Evolution Go existente. No se solicita la clave global del administrador del gateway.
- Puede conectar por QR, consultar estado y desconectar el CRM. Token cifrado; nunca vuelve al navegador ni a logs.
- Mensajes individuales entrantes llegan a la bandeja existente, deduplicados; disparan el mismo agente. Grupos, estados y mensajes propios no disparan IA.
- Texto saliente usa el proveedor activo, conservando aislamiento, sandbox y guardas existentes. Nunca se reintenta un envío por otro proveedor.
- Funcionalidades no implementadas del conector fallan explícitamente antes de llamar a Meta.
- Tipos, lint, pruebas de contrato con mock (incluido fallo) y build deben verificarse. Conexión real requiere instancia del operador.

## Decisiones
Se preserva Meta y se introduce adaptador aislado. Este fork amplía la regla anterior «solo Cloud API» por instrucción explícita del responsable; Evolution Go es optativo. No se instala ni publica infraestructura remota automáticamente.
