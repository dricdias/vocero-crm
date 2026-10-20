# E2E — Central de Ajuda do Agi no CRM

Precondições: versões dos dois aplicativos publicadas, token dedicado configurado nos dois runtimes, AGI_SUPPORT=on e agente de suporte do Agi configurado.

1. Sem AGI_SUPPORT: nenhuma leitura externa e painel sem cartão da fonte.
2. Sem token no Agi: exportação 404. Token incorreto: 401. Token correto: somente JSON editorial (52 guias na base inicial), sem contas nem conversas.
3. Painel do CRM mostra fonte sincronizada sem mostrar token. Entradas manuais continuam intactas.
4. Perguntar no WhatsApp como recuperar senha: resposta segue o guia; não pede senha ou código e não diz que alterou a conta.
5. Perguntar como conectar Google/Instagram: usar guias corretos. Fazer uma continuação curta e conferir uso do contexto anterior.
6. Perguntar algo fora dos guias: confirmar com humano; não inventar preço, menu ou prazo.
7. Publicar mudança editorial no Agi, aguardar expiração do cache e fazer nova pergunta: aparece a nova revisão, sem importação manual.
8. Indisponibilizar temporariamente a fonte: cópia válida por até uma hora; depois somente base local e aviso de indisponibilidade, sem perda de mensagens.
9. Laboratório avalia respostas contra os mesmos guias. GET /api/bot/profile inclui a referência editorial sem mudar o formato do contrato.
10. Desativar conector não apaga base manual ou histórico.

Testes automáticos de contrato/cache/seleção em tests/unit/agi-support.test.ts; teste da exportação no repositório Agi em scripts/test-crm-knowledge.mjs. Verificação real depende da configuração dos dois runtimes.
