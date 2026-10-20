# Plan
1. Exportar en Agi solamente campos editoriales y revisión determinista; autenticar con token propio y mantener el proxy de sesión intacto para las demás rutas.
2. Adaptador de lectura en CRM con Zod, timeout, límite de respuesta, caché acotada y degradación.
3. Componer la referencia del turno según pregunta; incluir snapshot completo en juez/perfil externo y estado en el panel existente.
4. Verificar contratos y flujos con mocks y checks locales en los dos repositorios.
5. Preparar PRs independientes y documentar variables y orden de despliegue. No publicar secretos.
