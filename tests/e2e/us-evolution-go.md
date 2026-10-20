# E2E — Evolution Go opcional

## Preparación

CRM con migraciones aplicadas, `EVOLUTION_GO=on`, administrador autenticado, instancia Evolution Go dedicada y segundo teléfono. `APP_BASE_URL` debe ser accesible desde el gateway. No registrar tokens ni payloads completos.

## Casos de aceptación

1. Sin bandera: opción ausente; settings y webhook responden 404.
2. Como miembro: GET/PUT/POST/DELETE de settings responden 403.
3. Con Meta conectado: guardar Evolution da 409; Meta sigue funcionando. Desconectar Meta conserva historial.
4. URL/token inválidos: error claro, sin token en respuesta. Credencial válida: se guarda cifrada y el webhook usa categorías MESSAGE/READ_RECEIPT/CONNECTION/QRCODE.
5. Generar QR, escanear y consultar estado: conectado solo si Connected y LoggedIn son true. Con passkey, continuar desde panel del gateway.
6. Desde otro teléfono, enviar texto: un contacto, un mensaje, un turno del agente. Repetir idéntico webhook: sin mensaje ni turno duplicado.
7. Enviar texto desde bandeja y desde IA: llega una vez al teléfono, ID/recibos evolucionan sin degradarse; ninguna llamada a Meta.
8. Enviar/recibir foto, audio y documento: archivo descargado al volumen local y accesible solo en su organización. Fallo de envío conserva adjunto como failed.
9. Grupos y mensajes propios no disparan IA; identidad @lid se conserva sin teléfono inventado.
10. Webhook con secreto desconocido: 404; token de instancia incorrecto: 401; sin efectos.
11. Sandbox del Laboratorio, otra organización y ventana vencida: envío bloqueado antes del gateway.
12. Caída/401 del gateway: fallo explícito sin reenvío por Meta; 401 requiere reconexión.
13. Desvincular: historial conservado, antiguo webhook inválido; Meta puede conectarse otra vez.

Verificación automática complementaria: `pnpm test -- tests/unit/evolution-go.test.ts tests/unit/evolution-settings.test.ts tests/unit/evolution-send.test.ts`. Los pasos con teléfono real siguen pendientes hasta disponer de la instancia del operador.
