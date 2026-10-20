# Contrato del webhook Evolution Go (031)

`POST /api/webhooks/evolution/<secreto>` solo con `EVOLUTION_GO=on`. Secreto aleatorio de 256 bits por conexión; se almacena solo su SHA-256. El CRM lo registra en `/instance/connect`, no lo devuelve a clientes. Resuelve organización por hash y verifica `instanceToken` con comparación constante contra la credencial descifrada. Sin bandera o secreto desconocido: 404. JSON inválido o token incorrecto: 401. Autenticado: 200 `{received:true}`, procesamiento en `after()`.

Entrada: `{event:string, instanceToken:string, data:unknown}` validada con Zod. `Message`: `data.Info` + `data.Message` según contrato oficial citado en `docs/evolution-go-investigacion.md`; dedup por `evo:<Info.ID>`. `Receipt`: `MessageIDs[]`, `Type`, `Timestamp`; entrega y lectura solo avanzan estados. Los eventos de conexión actualizan disponibilidad, sin crear mensajes.

La API autenticada `/api/settings/evolution` requiere owner/admin: GET devuelve estado, URL base y últimos cuatro del token; PUT recibe `{baseUrl,token}`, valida instancia y registra webhook; POST `{action:"qr"|"status"}`; DELETE desvincula solo el CRM. Conflicto con Meta: 409. Error externo: 502 sin cuerpo del proveedor.
## Compatibilidad adicional del cerebro externo

`GET /api/bot/media/evo:<id>` admite identificadores de adjuntos recibidos por Evolution Go y devuelve el mismo binario privado con límite de 16 MB, autorización de bot y alcance de organización. El camino de identificadores Meta permanece igual. Las claves de descarga del protocolo quedan cifradas en el payload interno; el serializador de mensajes nunca entrega ese payload binario al navegador.
