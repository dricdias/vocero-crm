# Agente do CRM usando a Central de Ajuda do Agi

O conector lê apenas os guias editoriais já usados pela Central de Ajuda. Não lê conversas de suporte, contas ou dados de clientes. O CRM baixa um snapshot autenticado e faz a busca local: as perguntas dos clientes não são enviadas ao servidor do Agi para essa consulta.

## Configurar após publicar as duas alterações

1. Criar um token exclusivo de leitura com `openssl rand -hex 32`, sem exibi-lo em logs ou mensagens.
2. No runtime do Agi (Vercel), cadastrar `CRM_KNOWLEDGE_TOKEN` com esse valor e publicar a versão com a rota de exportação.
3. No runtime do CRM (Coolify), cadastrar:
   - `AGI_SUPPORT=on`
   - `AGI_SUPPORT_URL=https://agiteam.app/api/integracoes/crm/conhecimento`
   - `AGI_SUPPORT_TOKEN` com o mesmo token exclusivo.
4. Fazer redeploy do CRM. Em Agente / Base de conhecimento, conferir a indicação dos guias sincronizados.
5. Revisar o perfil para atendimento de suporte do Agi e testar no Laboratório: senha, conexão de Instagram/Google, WhatsApp, agentes e pedido de atendimento humano.

Não substituir chaves do Supabase, do 9router ou do WhatsApp; o token desta integração é próprio. Fica somente nos servidores. A rota de exportação responde 404 sem configuração e 401 sem autenticação correta.

## Atualização e limites

São selecionados no máximo cinco guias pertinentes à pergunta e, quando útil, à pergunta anterior, com até 18 mil caracteres adicionais por turno. A base manual existente continua disponível. O juiz do Laboratório e o perfil usado por bots externos recebem também o conteúdo editorial completo para consultar os mesmos fatos.

O cache é atualizado na primeira consulta após cinco minutos. Alterar guias em `src/lib/support/knowledge.ts` e publicá-los no Agi basta para disponibilizar a nova revisão ao CRM; não precisa copiar arquivo Markdown. Se o Agi falhar, uma cópia válida é usada por até uma hora, com estado visível no painel. Depois disso o agente usa apenas a base local confirmada e encaminha o que não souber para uma pessoa. Não realiza ações na conta do cliente.

Esta integração é opcional e não altera o banco. Remover `AGI_SUPPORT=on` e fazer redeploy a desativa sem apagar entradas manuais, contatos ou mensagens.
