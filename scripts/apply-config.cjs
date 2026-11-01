/** Executar DEPOIS de copiar a atualização: node scripts/apply-config.cjs
 * Mescla somente campos necessários, preservando extra.eas.projectId e ajustes locais. */
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
function read(name) { return JSON.parse(fs.readFileSync(path.join(root,name),'utf8')); }
function write(name,value) { fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2)+'\n'); }
for (const asset of ['icon.png','adaptive-icon.png','splash-icon.png']) {
  if (!fs.existsSync(path.join(root,'assets',asset))) throw new Error(`Copie assets/${asset} antes de continuar.`);
}
const app = read('app.json');
if (!app.expo || !app.expo.android) throw new Error('app.json sem expo.android. Verifique o projeto.');
app.expo.version='2.1.0';
app.expo.icon='./assets/icon.png';
app.expo.android.adaptiveIcon={foregroundImage:'./assets/adaptive-icon.png',backgroundColor:'#13845B'};
app.expo.plugins=Array.isArray(app.expo.plugins)?app.expo.plugins:[];
app.expo.plugins=app.expo.plugins.filter(item=>!(item==='expo-splash-screen'||Array.isArray(item)&&item[0]==='expo-splash-screen'));
app.expo.plugins.push(['expo-splash-screen',{
  backgroundColor:'#F3F7F5',image:'./assets/splash-icon.png',imageWidth:180,
  dark:{backgroundColor:'#0B1110',image:'./assets/splash-icon.png'},
}]);
write('app.json',app);
const pkg=read('package.json');pkg.version='2.1.0';write('package.json',pkg);
if (fs.existsSync(path.join(root,'eas.json'))) {
  const eas=read('eas.json');
  if (eas.build?.preview) {
    eas.build.preview.autoIncrement=true;
    eas.build.preview.distribution='internal';
    eas.build.preview.android={...eas.build.preview.android,buildType:'apk'};
    write('eas.json',eas);
  }
}
if (fs.existsSync(path.join(root,'tsconfig.json'))) {
  const ts=read('tsconfig.json');
  if (ts.compilerOptions && 'baseUrl' in ts.compilerOptions) {delete ts.compilerOptions.baseUrl;write('tsconfig.json',ts);}
}
console.log('Configurações atualizadas sem substituir projectId, package Android ou credenciais EAS.');
console.log('Identificador Android atual:',app.expo.android.package);
