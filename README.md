# Finance

**Finance** é um aplicativo móvel de finanças pessoais desenvolvido com **React Native, Expo (SDK 57), TypeScript e SQLite**. O projeto adota uma abordagem **offline-first**, mantendo os registros financeiros localmente no dispositivo.

## Funcionalidades

- Registro e acompanhamento de **receitas** e **despesas**.
- Organização por **contas**, **categorias** e **meios de pagamento**.
- Gestão de **cartões**, compras no crédito e faturas.
- Controle de **metas**, **limites mensais**, **recorrências** e **parcelamentos**.
- **Transferências entre contas** sem gerar receitas ou despesas artificiais.
- **Análises mensais**, histórico, exportação e backup local.
- **Lembretes** e acompanhamento de vencimentos.

## Identidade e experiência

A interface preserva a identidade visual verde do Finance e organiza os recursos em cinco abas principais: **Início, Despesas, Receitas, Metas e Análises**. O objetivo é oferecer uma experiência simples, consistente e acessível para o acompanhamento financeiro cotidiano.

## Tecnologia e arquitetura

- **React Native + Expo Router** — interface e navegação.
- **TypeScript** — contratos e tipagem estática.
- **SQLite** — persistência local e migrações versionadas.
- **Services e Repositories** — separação entre regras financeiras e acesso aos dados.
- **Node.js e Python** — testes automatizados de lógica e persistência.
- **GitHub Actions** — validação automática do código.

O desenvolvimento segue práticas de **Clean Code**, mudanças incrementais, testes de regressão e preservação dos dados e da identidade visual do aplicativo.

## Privacidade

O Finance funciona sem exigir sincronização com servidor. Dados financeiros e backups pessoais **não fazem parte deste repositório**. Arquivos de backup JSON exportados pelo aplicativo não são criptografados; devem ser armazenados com cuidado.

**Versão do projeto:** 2.8.1.
