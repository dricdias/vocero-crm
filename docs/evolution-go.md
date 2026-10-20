# Evolution Go en este fork

## Activar

En las variables de runtime del CRM (Coolify), añadir `EVOLUTION_GO=on` y volver a desplegar. La migración aditiva `0021_spooky_silk_fever.sql` se aplica al arrancar el contenedor; en desarrollo, ejecutar `pnpm db:migrate`. Sin la bandera no aparece el selector y `/api/settings/evolution` y el webhook devuelven 404.

En Ajustes → WhatsApp, desconectar Meta si está activo, elegir Evolution Go y pegar:
- URL raíz de su servidor Evolution Go, sin `/instance` ni otras rutas.
- Token de una instancia existente (no la clave global del administrador).

Guardar registra automáticamente el webhook del CRM en esa instancia. Esto sustituye el webhook que la instancia tuviera antes. Usar una instancia dedicada al CRM si otros sistemas necesitan recibir sus eventos. Generar QR, escanear en WhatsApp → Dispositivos vinculados y consultar estado. Si necesita passkey, completar el vínculo desde el panel Evolution Go y volver a consultar estado.

`APP_BASE_URL` debe ser la URL pública HTTPS del CRM, accesible desde Evolution Go. El token queda cifrado; el webhook usa secreto aleatorio y verifica también `instanceToken`. No enviar logs con el cuerpo completo: contiene el token.

## Comportamiento

Mensajes individuales entrantes usan la misma bandeja, contactos, pipeline y agente. Texto, imágenes, audio, video, documentos y stickers entrantes se descargan a disco del CRM; texto y archivos salientes usan el gateway. Se preservan sandbox, ventana y límites existentes del CRM, aunque Evolution Go permita otras políticas. No hay fallback de envío a Meta. Recibos conocidos actualizan estado de forma monotónica.

Meta continúa disponible. Solo un transporte puede estar configurado por organización; los cambios se serializan con un advisory lock de Postgres. Desvincular Evolution Go borra sus credenciales locales e invalida su webhook; no cierra la sesión del teléfono ni elimina conversaciones. El gateway puede seguir reintentando el webhook invalidado hasta que se quite desde su panel.

## Límites y verificación

No se importan conversaciones históricas, grupos ni mensajes propios del teléfono. No hay plantillas de Meta ni indicador de escritura por Evolution Go; enviar ubicación/contactos estructurados falla explícitamente. Los contactos sin teléfono deben revisarse según la compatibilidad de JID del gateway. La capacidad de conexión depende de la versión Evolution Go desplegada; contratos revisados en `evolution-go-investigacion.md`.

Verificación automatizada: tests de contrato con fetch simulado, configuración apagada/encendida en CI, tipos, lint y build. Pendiente de verificación humana: guardar credencial real, escanear QR, recibir mensaje de otro teléfono, obtener respuesta del agente, enviar/recibir adjunto y reconectar. No se ha desplegado este cambio ni configurado una instancia remota.

## Atualização do fork pt-BR no Coolify

Integrar este commit à branch `pt-br` de `dricdias/vocero-crm`, que já é a fonte do aplicativo existente. Em Environment Variables, adicionar `EVOLUTION_GO=on` como variável de execução e fazer redeploy com o Dockerfile da raiz. Manter domínio, porta 3000, volume `/data`, conexão Postgres e chaves atuais. Não substituir o aplicativo pela imagem oficial: ela não contém este conector.

A migração é aplicada automaticamente pelo entrypoint. Após a aplicação ficar saudável, abrir Configurações / WhatsApp, selecionar Evolution Go, salvar a URL raiz e o token de uma instância dedicada, gerar QR e consultar estado após vincular. Se for preciso ocultar o conector, retirar a flag e fazer novo deploy; o banco e os dados existentes permanecem.
