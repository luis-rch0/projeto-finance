# Arquitetura do Finance

Versão de referência: 2.8.1 (Expo SDK 57, React Native, SQLite local).

## Fluxo

```text
app/ (Expo Router) + src/features/ (telas e formulários)
    ↓
src/hooks/ + src/services/ (orquestração e validação)
    ↓
src/database/repositories/ (queries parametrizadas)
    ↓
src/database/ + migrations/ (SQLite, esquema versionado)
```

Componentes reutilizáveis em `src/components/`; tipos de negócio em `src/types/`; funções puras em `src/utils/`; cores e tokens em `src/theme/`.

## Invariantes que não devem regredir

- Valores monetários em centavos inteiros; cálculos de saldo têm testes de regressão.
- Transferências entre contas não aparecem como nova receita ou despesa.
- Consumo e fluxo de caixa têm regras distintas para compras no crédito e pagamento de faturas.
- Banco local offline-first. Migrações `001` a `011` são históricas e imutáveis; novas colunas/tabelas exigem migração `012+`.
- Backup v8 inclui transferências e dá suporte à restauração dos formatos anteriores já aceitos.
- Dados locais persistem na atualização de APK quando a identidade, assinatura e dados do aplicativo são preservados.

## Critérios de qualidade

- Uma tela não deve criar SQL. Acrescentar consultas em repositories e validar regras nos services.
- Funções de domínio e validações previsíveis devem permitir testes unitários, sem exigir interface nativa.
- Erros mostrados ao usuário devem ser acionáveis e não revelar detalhes de dados.
- Não reformatar arquivos não relacionados nem acrescentar bibliotecas de arquitetura sem necessidade.
- Medir desempenho antes de otimizar; não assumir que lentidão do Expo Go corresponde à do APK.

## Dívidas técnicas registradas

- `backupService.ts` e `creditCardService.ts` concentram responsabilidades extensas; dividir só após cobertura de testes adequada.
- As listas mais longas ainda exigem paginação e virtualização em telas adequadas.
- Os testes atuais cobrem lógica em Node e SQLite em Python; não substituem testes E2E de Android.
- Backup JSON exportado não é criptografado: tratar arquivos de exportação como dados pessoais e não publicá-los.
