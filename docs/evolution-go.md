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

No se importan conversaciones históricas ni mensajes propios del teléfono. Los grupos se ignoran salvo activación explícita descrita abajo. No hay plantillas de Meta ni indicador de escritura por Evolution Go; enviar ubicación/contactos estructurados falla explícitamente. Los contactos sin teléfono deben revisarse según la compatibilidad de JID del gateway. La capacidad de conexión depende de la versión Evolution Go desplegada; contratos revisados en `evolution-go-investigacion.md`.

Verificación automatizada: tests de contrato con fetch simulado, configuración apagada/encendida en CI, tipos, lint y build. Pendiente de verificación humana: guardar credencial real, escanear QR, recibir mensaje de otro teléfono, obtener respuesta del agente, enviar/recibir adjunto y reconectar. No se ha desplegado este cambio ni configurado una instancia remota.

## Atualização do fork pt-BR no Coolify

Integrar este commit à branch `pt-br` de `dricdias/vocero-crm`, que já é a fonte do aplicativo existente. Em Environment Variables, adicionar `EVOLUTION_GO=on` como variável de execução e fazer redeploy com o Dockerfile da raiz. Manter domínio, porta 3000, volume `/data`, conexão Postgres e chaves atuais. Não substituir o aplicativo pela imagem oficial: ela não contém este conector.

A migração é aplicada automaticamente pelo entrypoint. Após a aplicação ficar saudável, abrir Configurações / WhatsApp, selecionar Evolution Go, salvar a URL raiz e o token de uma instância dedicada, gerar QR e consultar estado após vincular. Se for preciso ocultar o conector, retirar a flag e fazer novo deploy; o banco e os dados existentes permanecem.

## Grupos: responder somente por menção

No Coolify, adicionar `EVOLUTION_GO_GROUP_BOT_NUMBER` com o número conectado ao Evolution Go (DDI, DDD e número, somente dígitos) e fazer Deploy. Requer `EVOLUTION_GO=on`. Não é uma senha. Sem número válido, o comportamento continua individual. Não é necessário reconectar o WhatsApp nem alterar o webhook.

No Evolution Go, a instância precisa permitir eventos de grupos: `IgnoreGroups` e a configuração global `EVENT_IGNORE_GROUP` devem estar desligados. O CRM não muda essas opções automaticamente. No grupo, escolher o contato do agente na lista de menções do WhatsApp; digitar um `@nome` como texto simples não cria uma menção. Para iniciar um assunto, mencionar o agente. Para continuar, o participante pode usar Responder numa mensagem enviada pelo agente ao seu atendimento, sem repetir @. O CRM confirma o ID da mensagem no banco: precisa ser uma saída de IA do mesmo grupo, participante e organização. Citar mensagens de outras pessoas, de outro atendimento ou apenas um texto que contém uma menção não o convoca.

O CRM recebe somente as perguntas com menção ao próprio agente. Menções a outras pessoas e mensagens próprias são ignoradas. Menções em texto e legendas de anexos são reconhecidas. Quando o WhatsApp usa um identificador LID, o CRM consulta `POST /user/check` para confirmar o LID do número configurado (cache de cinco minutos, nova tentativa após falha em 30 segundos). Se não puder confirmar a identidade, não responde por suposição.

Cada combinação de grupo e participante gera um atendimento separado, sem telefone associado e sem reutilizar o histórico privado do participante. A identidade é `evo-group:<grupo@g.us>:<participante@s.whatsapp.net ou @lid>`, e `conversation.channelThreadRef` guarda o grupo. A resposta vai ao grupo com menção somente ao participante atendido. O agente recebe instruções para lembrar que a resposta é pública e orientar assuntos privados para uma conversa individual. Ele não lê o restante da conversa do grupo.

Os bloqueios de sandbox, organização, janela e handoff continuam aplicados. Um handoff pausa somente o atendimento daquele participante naquele grupo; para retomar, reativar a IA dessa conversa na bandeja. Conversas de grupo não são enviadas pela Meta se Evolution for desconectado. Remover a variável e fazer Deploy impede novas entradas de grupos sem apagar os históricos existentes.

Teste de aceitação: enviar mensagem sem menção (silêncio), mencionar outra pessoa (silêncio), mencionar o agente com pergunta dos guias (resposta no grupo), repetir com outro participante (atendimento independente), testar uma pergunta no privado (continua respondendo). Ver `tests/e2e/us-evolution-group-mentions.md`.

## Alternar entre os dois modos no CRM

Depois do primeiro atendimento no grupo, abrir uma conversa desse grupo na Bandeja e abrir os detalhes pelo ícone do painel à direita. Em **Respostas neste grupo**, escolher **Menções e respostas ao agente** (padrão atual) ou **Todas as mensagens do grupo**, e clicar **Salvar modo do grupo**. Só administradores alteram a escolha; membros conseguem consultar.

A escolha vale para todos os participantes daquele grupo, sem alterar outros grupos ou o privado. No modo todas, perguntas novas entram sem @; no modo menções, continua aceitando @ e Responder numa saída do agente no atendimento daquele participante. Os históricos seguem separados por participante. O agente mantém as regras de encerramento, handoff e pausa da IA: alterar o modo não reativa um atendimento pausado.

A troca afeta as próximas entradas, sem importar mensagens antigas nem cancelar turnos já em processamento. A preferência é salva no banco por organização e grupo, sem precisar reconectar o WhatsApp ou fazer Deploy para cada teste. Este recurso requer publicar a versão com a migração aditiva `0022_evolution_group_mode.sql`, aplicada automaticamente no arranque. Sem preferência salva, continua em menções. As flags `EVOLUTION_GO` e `EVOLUTION_GO_GROUP_BOT_NUMBER` continuam necessárias.
