# Instruções para agentes — Finance

Leia `SKILLS.md` antes de alterações substanciais. Identifique a finalidade da tarefa e consulte somente as especialidades pertinentes.

## Prioridades

1. Preserve os dados SQLite existentes, migrações publicadas, backups e a assinatura Android.
2. Não mude as cinco abas, o esquema de cores verde ou os fluxos do usuário sem pedido explícito.
3. Separe responsabilidades: `app/` e `src/features/` para interface; `src/services/` para casos de uso e validação; `src/database/repositories/` para SQL; `src/utils/` para funções puras.
4. Não faça refatorações cosméticas massivas. Trabalhe em incrementos com testes antes/depois.
5. Dinheiro é armazenado como centavos inteiros. Transferências não são receita/despesa. O pagamento de fatura não pode contar consumo em duplicidade.
6. Nunca registre no GitHub backups pessoais, arquivos SQLite, tokens ou credenciais. A inclusão no `.gitignore` não remove dados já commitados.
7. Validar `npm run quality`, `npm run typecheck`, `npm test`, `npm run test:db` e `npm run doctor`; executar teste real em Android após alterações de interface.
8. Reportar o que foi alterado, resultado dos testes e comandos de execução, versão e novo APK EAS.

## Skills

A documentação operacional original está na Biblioteca pessoal do usuário em `/Padroes-Desenvolvimento-IA` (não embutida neste projeto). `SKILLS.md` indica o uso correspondente. A presença desses nomes no GitHub não ativa ferramentas nem instala skills automaticamente.
