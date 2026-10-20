# Verificação — integração ao fork pt-BR

Data: 2026-10-20. Base: `pt-br` em `713ee819f0ca59e053d102c927602bf9d1b5ce3f`. Trabalho isolado em `feat/evolution-go`.

- Integração por merge de três vias com a base upstream, sem conflitos. Traduções, moeda/fuso e adaptador 9router existentes preservados. Interface e novos erros do conector em português.
- `pnpm install --frozen-lockfile`: passou sem alterações ao lockfile.
- `pnpm typecheck`, `pnpm lint` e `git diff --check`: passaram.
- Suite sem a flag: 106 arquivos / 1190 testes passaram.
- Suite com `EVOLUTION_GO=on`: 106 arquivos / 1190 testes passaram (inclui os testes novos e os testes adicionais do 9router do fork).
- `pnpm build`: passou, incluindo verificação de tipos, lint e geração de rotas. A flag é avaliada em runtime; não requer tokens durante o build.
- A migração aditiva `0021_spooky_silk_fever.sql` foi gerada com Drizzle e revisada; será aplicada pelo entrypoint ao iniciar o contêiner. Não foi aplicada a uma base remota.
- Verificação anterior da tela isolada (React real e API simulada): desktop 1440 e celular 390, sem erros JS ou overflow, ação Consultar estado verificada. Não equivale a teste de autenticação ou pareamento real.

Pendente: revisão/merge na branch de implantação, variável `EVOLUTION_GO=on` no Coolify e redeploy. Depois, registrar URL/token de uma instância real, parear QR/passkey e validar mensagens, anexos, recibos e reconexão. Guion: `tests/e2e/us-evolution-go.md`.

Sem alteração de produção ou de credenciais remotas durante esta preparação.
