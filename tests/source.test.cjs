/** Checagem local: JSX/TypeScript, imports internos e versões principais. */
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const extensions = ['.ts','.tsx','.js','.jsx','.json'];
const files = [];
function walk(folder) {
  for (const entry of fs.readdirSync(folder,{withFileTypes:true})) {
    const absolute=path.join(folder,entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
}
walk(path.join(root,'app'));
walk(path.join(root,'src'));
let issues=[];
function existsLocal(absolute) {
  return [absolute,...extensions.map(x=>absolute+x),
    ...extensions.map(x=>path.join(absolute,'index'+x))].some(x=>fs.existsSync(x)&&fs.statSync(x).isFile());
}
for (const file of files) {
  const text=fs.readFileSync(file,'utf8');
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,
    file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  for (const diagnostic of source.parseDiagnostics) {
    const {line,character}=source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    issues.push(`${path.relative(root,file)}:${line+1}:${character+1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText,' ')}`);
  }
  const data=ts.preProcessFile(text,true,true);
  for (const entry of data.importedFiles) {
    const name=entry.fileName;
    const resolved=name.startsWith('@/')?path.join(root,'src',name.slice(2)):
      name.startsWith('.')?path.resolve(path.dirname(file),name):null;
    if (resolved && !existsLocal(resolved)) issues.push(`Import não encontrado: ${path.relative(root,file)} => ${name}`);
  }
}
const pkg=require(path.join(root,'package.json'));
const expected={react:'19.2.3','react-dom':'19.2.3','react-native':'0.86.3',
  'react-native-reanimated':'4.5.1','react-native-worklets':'0.10.1'};
for (const [key,value] of Object.entries(expected)) {
  if(pkg.dependencies[key]!==value)issues.push(`Versão incompatível no package.json: ${key} (${pkg.dependencies[key]} !== ${value})`);
}
for (const name of ['expo-document-picker','expo-file-system','expo-sharing']){
  if(!pkg.dependencies[name])issues.push(`Dependência de backup ausente: ${name}`);
}
const config=require(path.join(root,'app.json'));
assert.equal(config.expo.android.package,'com.finance.local');
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}
else console.log(`OK: ${files.length} arquivos TS/TSX com sintaxe e imports locais válidos; dependências críticas declaradas.`);
