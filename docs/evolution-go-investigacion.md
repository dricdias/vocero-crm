# Evolution GO: contratos para el conector opcional

Investigación del 19 de octubre de 2026. Fuente primaria: repositorio oficial `evolution-foundation/evolution-go`, revisión `9337afc47e10b86cc896a6f432240e40fee95dd1`. Se revisó el código porque algunos ejemplos de la wiki no coinciden con la implementación actual. Evolution GO utiliza whatsmeow; es un transporte de sesión vinculada por QR, diferente de WhatsApp Cloud API. [Servicio oficial](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/whatsmeow/service/whatsmeow.go).

## Autenticación y conexión

Las operaciones usan `apikey: <token de la instancia>`, resuelto en el servidor a una instancia. La clave global es administrativa, para crear/listar/eliminar instancias; el CRM puede integrar una instancia existente sin almacenarla. No se pone el nombre de instancia en las rutas operativas. [Middleware](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/middleware/auth_middleware.go), [rutas](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/routes/routes.go).

| Método y ruta | Contrato actual |
|---|---|
| `POST /instance/connect` | JSON `{"webhookUrl":"https://crm.example/api/webhooks/evolution/SECRETO","subscribe":["MESSAGE","READ_RECEIPT","CONNECTION","QRCODE"]}`. Guarda webhook y suscripciones, incluso si la instancia ya está ejecutándose. |
| `GET /instance/status` | `{"message":"success","data":{"Connected":true,"LoggedIn":true,"Name":"…"}}`. Las mayúsculas son reales. `myJid` no se exporta en el struct Go y no aparece en JSON. |
| `GET /instance/qr` | `{"message":"success","data":{"qrcode":"…","code":"…"}}`. Puede devolver campos `passkeyStage`, `passkeyOpenUrl`, `passkeyCode` cuando se necesita passkey, en lugar de QR. |
| `POST /instance/disconnect` | Desconecta la sesión. |
| `POST /instance/reconnect` | Reconecta. |
| `DELETE /instance/logout` | Cierra la sesión vinculada. |

La respuesta de conectar contiene `data.jid`, `data.webhookUrl`, `data.eventString`. Las categorías de suscripción son **MAYÚSCULAS** y se validan literalmente; los eventos entregados tienen nombres distintos (`Message`, `Receipt`, etc.). No usar los ejemplos antiguos `messages.upsert` o `connection.update`. [Servicio de instancias](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/instance/service/instance_service.go), [handler](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/instance/handler/instance_handler.go), [categorías](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/internal/event_types/event_types.go).

## Envío y adjuntos

`POST /send/text` recibe `{"number":"5511999999999","text":"Hola"}`. Admite `id`, `delay`, `quoted: {messageId, participant}` y otras opciones. La respuesta es `{"message":"success","data":{"Info":{"ID":"…"},"Message":{…}}}`: persistir `data.Info.ID`, no buscar `key.id`. [Tipos y servicio](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/sendMessage/service/send_service.go), [handler](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/sendMessage/handler/send_handler.go).

`POST /send/media` admite JSON `{"number":"5511999999999","url":"https://example.com/foto.jpg","type":"image","caption":"Hola","filename":"foto.jpg"}`. Tipos básicos: `image`, `video`, `audio`, `document`. También admite multipart con campos equivalentes y archivo `file`, útil para adjuntos privados del CRM. No necesita subir primero un media ID a Meta. [Handler de medios](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/sendMessage/handler/send_handler.go).

`POST /message/downloadmedia` recibe `{"message": <objeto Message completo del webhook>}` y devuelve `{"message":"success","data":{"base64":"data:<mime>;base64,…","timestamp":"…"}}`. No recibe un ID aislado. El webhook puede ya incluir `data.Message.base64` o `data.Message.mediaUrl`/`mimetype`, dependiendo de MinIO y de si la descarga automática tuvo éxito. [Servicio de descarga](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/message/service/message_service.go), [handler](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/message/handler/message_handler.go), [construcción del webhook](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/whatsmeow/service/whatsmeow.go).

## Webhooks reales y seguridad

La envoltura actual incluye `event`, `data`, `instanceId`, `instanceName` y **`instanceToken` secreto**. `Message.data` es el evento whatsmeow: `Info` y `Message` tienen inicial mayúscula. Campos relevantes: `Info.ID`, `Info.Chat`, `Info.Sender`, `Info.IsFromMe`, `Info.IsGroup`, `Info.Timestamp`, `Info.PushName`; texto en `Message.conversation` o `Message.extendedTextMessage.text`. Los JID pueden ser teléfonos o identidades `@lid`; no asumir teléfono. `Receipt.data` contiene `MessageIDs`, `Type`, `Timestamp` y `Chat`. El CRM debe mapear únicamente recibos conocidos y conservar estados monotónicos. [Serialización y selección de eventos](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/whatsmeow/service/whatsmeow.go).

El productor HTTP establece solamente `Content-Type: application/json`; no firma HMAC ni añade Authorization. Reintenta hasta cinco intentos con intervalo de 30 segundos si no obtiene 2xx. La integración necesita URL de webhook impredecible y comparación del `instanceToken` con la credencial cifrada de esa organización antes de ingerir; esta es una recomendación derivada del contrato, no una firma ofrecida por Evolution GO. Nunca registrar el cuerpo completo ni devolver el token al navegador. [Productor HTTP oficial](https://github.com/evolution-foundation/evolution-go/blob/9337afc47e10b86cc896a6f432240e40fee95dd1/pkg/events/webhook/webhook_producer.go).

## Alcance mínimo fiable

Guardar URL base y token de una instancia existente; comprobar estado; configurar webhook y suscripciones; mostrar QR; recibir mensajes individuales de texto y adjuntos; enviar texto/archivo; actualizar recibos idempotentemente. Separar este transporte opcional de Cloud API y conservar el aislamiento de organización, cifrado, sandbox y despacho hacia el agente. La compatibilidad definitiva requiere prueba contra la versión instalada por el usuario: `main` cambia y la wiki contiene ejemplos incompatibles con el código actual. [Wiki oficial de eventos](https://github.com/evolution-foundation/evolution-go/blob/main/docs/wiki/recursos-avancados/events-system.md), [implementación revisada](https://github.com/evolution-foundation/evolution-go/tree/9337afc47e10b86cc896a6f432240e40fee95dd1).
