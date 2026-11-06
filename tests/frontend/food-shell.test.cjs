const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
for (const ext of ['.ts','.tsx']) require.extensions[ext]=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
require.extensions['.css']=()=>{};
const {AppShell}=require('../../src/ui/food-first/AppShell.tsx');
test('all destinations preserve four reachable tabs and the active destination',()=>{
 for(const screen of ['today','menu','shopping','more','diary','support','recipe']){
  const html=renderToStaticMarkup(React.createElement(AppShell,{activeScreen:screen,canGoBack:true,onGoBack(){},onNavigate(){},shoppingNeedsRefresh:true},'content'));
  assert.equal((html.match(/data-testid="bottom-nav-/g)||[]).length,4);
  assert.ok(!html.includes('bottom-nav-diary'));
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  assert.match(html,/Список нужно обновить/);
  assert.match(html,/Вернуться на предыдущий экран/);
 }
});
