# Verificação — fonte editorial do Agi

2026-10-20. Preparado em branch isolada feat/agi-support-knowledge, a partir de pt-br.

- Instalacao frozen-lockfile, tipos, lint e build do CRM passaram.
- Suite com AGI_SUPPORT=on: 107 arquivos / 1205 testes passaram.
- Suite com AGI_SUPPORT, Evolution Go, canais e agenda ligados: 107 arquivos / 1205 testes passaram.
- Leitor testado com fonte simulada: autenticacao, validacao, limite de bytes, timeout/falha, cache, concorrencia, expiracao e selecao de guias.
- Interface isolada verificada em desktop 1440 e celular 390: fonte sincronizada e copia em cache, sem erros JS ou overflow. Detector de UI sem achados.
- No Agi, exportacao editorial e proxy autenticado testados com os 52 guias reais (25234 caracteres). Build, tipos e lint dos arquivos alterados passaram.
- Nao ha migracao nem alteracao de dados existentes.

Pendente de ativacao: publicar os dois aplicativos, cadastrar o token de leitura nos dois runtimes e verificar uma pergunta real no WhatsApp/Laboratorio. Nenhum segredo foi gerado, exibido ou publicado neste trabalho. Fonte nao foi ativada em producao.
