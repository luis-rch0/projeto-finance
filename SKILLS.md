# Skills aplicadas ao Finance

Referência: `/Padroes-Desenvolvimento-IA/SKILLS.md` (padrão autoral do projeto, consultado em 01/11/2026). O conteúdo completo das skills continua na Biblioteca, e seu acionamento depende do ambiente.

| Etapa | Skill de referência | Aplicação ao Finance |
| --- | --- | --- |
| Seleção | `route-skills` | Escolher somente competências necessárias |
| Execução | `development-workbench` | Dividir alterações em incrementos verificáveis |
| Auditoria | `project-audit` | Inventário, regressões e preservação do baseline |
| Arquitetura | `software-architecture` | UI / Service / Repository / SQLite, sem abstração prematura |
| Testes | `regression-testing` | TypeScript, Node, SQLite, Android real |
| Segurança | `application-security` | Backups e segredos, validação e proteção dos dados |
| Documentação | `documentation` | Guia reproduzível de GitHub, versões, EAS e rollback |
| Interface | `design-direction` + `design-visual-review` | Mudanças discretas, mantendo o verde e a navegação |

## Fluxo obrigatório

1. Conferir versão, arquivos, migrações e regras de negócio.
2. Registrar decisões e risco; não reescrever toda a aplicação.
3. Alterar somente módulos necessários; manter nomes, contratos e formatação consistentes.
4. Testar na revisão atual. Não confundir teste textual ou SQLite simulado com teste Android real.
5. Entregar logs de execução, checklist manual, guia de atualização e comandos EAS.

Fonte das skills gerais: https://github.com/anthropics/skills. Não copiar o código ou a licença de terceiros sem verificação.
