# Verificación

- Tests de webhook: all acepta texto sin mención ni consulta de LID; volver a mentions ignora la siguiente entrada común. Los casos existentes cubren ecos, grupos desactivados, citas y menciones.
- Nueve tests de repositorio/handler: default conservador, scope org/grupo, upsert compuesto, modo válido, permisos, rechazo de privado/sandbox/tenant ajeno y eventos.
- Suite local: 1240 tests correctos, 110 archivos. Typecheck y build correctos. Lint final tras retirar harness temporal.
- UI aislada con el componente real y API simulada: guardar all, recuperar fallo, modo de lectura para miembro, fallo de carga con reintento y ausencia de errores JS/overflow. Inspección desktop claro y móvil oscuro, con CSS y fuente del build. Detector mecánico sin hallazgos.
- SQL generado revisado: una tabla, FK e índice únicos y check; no altera tablas existentes.
- Pendiente tras Deploy: probar contra WhatsApp real con el guion E2E. No se enviaron mensajes reales desde el entorno local.
