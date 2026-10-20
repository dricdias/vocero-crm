# Plan
1. Conservar API Meta y añadir credenciales dedicadas por organización con token cifrado y secreto de webhook independiente.
2. Generar migración aditiva con drizzle-kit.
3. Adaptador HTTP con timeout, validación de respuesta y errores sin cuerpo del proveedor.
4. API autenticada de configuración solo owner/admin y webhook secreto que resuelve organización desde credenciales.
5. Integrar recepción y envío en puertas existentes. Añadir selector a Ajustes sin reemplazar wizard Meta.
6. Verificar con mocks, typecheck, lint, tests y build; documentar activación y límites.
