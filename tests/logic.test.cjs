/** Testes de lógica sem runtime Android. Executar com npm run test:logic. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname,'..');
const cache = new Map();
function importTS(relative) {
  const file = path.join(root,relative);
  if(cache.has(file))return cache.get(file).exports;
  const m={exports:{}};cache.set(file,m);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const locallyRequire = name => name.startsWith('@/') ? importTS('src/'+name.slice(2)+'.ts') :
    name==='expo-file-system/legacy'?{}:name==='expo-document-picker'?{}:name==='expo-sharing'?{}:createRequire(file)(name);
  new Function('require','module','exports',js)(locallyRequire,m,m.exports);
  return m.exports;
}
const {datesForMonth}=importTS('src/utils/recurrence.ts');
const {parseAndValidateBackup,BACKUP_FORMAT}=importTS('src/services/backupService.ts');
const emptyBackup=()=>({format:BACKUP_FORMAT,version:1,schema_version:4,
  exported_at:'2026-10-13T14:00:00.000Z',tables:{
    accounts:[{id:'a',name:'Carteira',type:'CASH',initial_balance_cents:0,created_at:'2026-10-13T14:00:00Z'}],
    categories:[{id:'c',name:'Alimentação',type:'EXPENSE',color:'#D94B56',icon:'1',archived_at:null}],
    savings_goals:[],transactions:[],goal_contributions:[],monthly_budgets:[],
    recurrence_rules:[],recurrence_occurrences:[],
  }});
test('recorrência mensal ajusta o dia 31 para fevereiro',()=>{
  assert.deepEqual(datesForMonth('2026-01-31',null,'MONTHLY',2026,2),['2026-02-28']);
  assert.deepEqual(datesForMonth('2026-01-31',null,'MONTHLY',2026,3),['2026-03-31']);
});
test('recorrência anual de 29/02 funciona em ano não bissexto',()=>{
  assert.deepEqual(datesForMonth('2024-02-29',null,'YEARLY',2025,2),['2025-02-28']);
  assert.deepEqual(datesForMonth('2024-02-29',null,'YEARLY',2025,3),[]);
});
test('recorrência semanal gera apenas datas do mês alvo',()=>{
  assert.deepEqual(datesForMonth('2026-10-03',null,'WEEKLY',2026,10),[
    '2026-10-03','2026-10-10','2026-10-17','2026-10-24','2026-10-31']);
});
test('backup completo vazio é aceito com conta',()=>{
  assert.equal(parseAndValidateBackup(JSON.stringify(emptyBackup())).tables.accounts.length,1);
});
test('backup inválido ou com referências quebradas é rejeitado',()=>{
  assert.throws(()=>parseAndValidateBackup('{'),/JSON válido/);
  const wrong=emptyBackup();wrong.tables.transactions.push({id:'t',account_id:'a',category_id:'missing',
    type:'EXPENSE',amount_cents:1000,description:'Teste',date:'2026-10-13',created_at:'2026-10-13T14:00:00Z',updated_at:'2026-10-13T14:00:00Z'});
  assert.throws(()=>parseAndValidateBackup(JSON.stringify(wrong)),/categoria incompatível/);
});
test('backup não aceita movimentação com valor decimal',()=>{
  const file=emptyBackup();file.tables.transactions.push({id:'t',account_id:'a',category_id:'c',
    type:'EXPENSE',amount_cents:10.5,description:'Teste',date:'2026-10-13',created_at:'2026-10-13T14:00:00Z',updated_at:'2026-10-13T14:00:00Z'});
  assert.throws(()=>parseAndValidateBackup(JSON.stringify(file)),/Movimentação inválida/);
});
const {allocateInstallments,addMonthsClamped}=importTS('src/utils/installments.ts');
test('parcelas somam o total exato, inclusive centavos restantes',()=>{
  assert.deepEqual(allocateInstallments(10001,3),[3334,3334,3333]);
  assert.equal(allocateInstallments(10001,3).reduce((a,b)=>a+b,0),10001);
  assert.throws(()=>allocateInstallments(2,3),/inválidos/);
});
test('vencimento mensal de 31 preserva data-âncora',()=>{
  assert.equal(addMonthsClamped('2026-01-31',1),'2026-02-28');
  assert.equal(addMonthsClamped('2026-01-31',2),'2026-03-31');
});
const {calculateCategoryStats,categorySymbol}=importTS('src/features/categories/categoryStats.ts');
test('números por categoria respeitam apenas os lançamentos filtrados',()=>{
  const cats=[
    {id:'c1',name:'Alimentação',type:'EXPENSE',color:'#fff',icon:'1',archived_at:null},
    {id:'c2',name:'Transporte',type:'EXPENSE',color:'#fff',icon:'2',archived_at:null},
  ];
  const filtered=[{category_id:'c1',amount_cents:1000},{category_id:'c1',amount_cents:2000},
    {category_id:'c2',amount_cents:1000}];
  const stats=calculateCategoryStats(filtered,cats);
  assert.equal(stats.length,2);
  assert.equal(stats[0].cents,3000);
  assert.equal(stats[0].count,2);
  assert.equal(stats[0].percent,75);
  assert.notEqual(categorySymbol(cats[0]),'1');
});

const {toCsv,centsAsBrazilianNumber} = importTS('src/utils/csv.ts');
test('CSV pt-BR preserva centavos e escapa conteúdo potencialmente perigoso',()=>{
  const csv = toCsv([['Nome','Valor'],['=HYPERLINK("https://x")',centsAsBrazilianNumber(12345)]]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes(`"'=HYPERLINK(""https://x"")"`));
  assert.ok(csv.includes('"123,45"'));
  assert.equal(centsAsBrazilianNumber(-123),' -1,23'.trim());
});

test('backup v1.3 com schema 5 continua aceito sem regras de orçamento automático',()=>{
  const legacy=emptyBackup();
  legacy.version=2;legacy.schema_version=5;
  legacy.tables.installment_plans=[]; legacy.tables.installment_items=[];
  const result=parseAndValidateBackup(JSON.stringify(legacy));
  assert.deepEqual(result.tables.budget_recurrence_rules,[]);
});
