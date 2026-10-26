const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const req=createRequire('C:/Users/HP/Keto-balance/package.json');
const ts=req('typescript');
const {loadTs}=req('./tests/helpers/load-ts.cjs');
const {RECIPES}=loadTs('src/data/recipes.ts');
const {generateMenu,replacementCandidates}=loadTs('src/domain/menu.ts');
const {isRecipeAllowed}=loadTs('src/domain/eligibility.ts');
const text=fs.readFileSync('C:/Users/HP/Keto-balance/src/App.tsx','utf8');
const tree=ts.createSourceFile('App.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handlerExpr;
function walk(n){
  if(ts.isFunctionDeclaration(n)&&n.name?.text==='PremiumPage'){
    function find(a){
      if(ts.isJsxAttribute(a)&&a.name.getText(tree)==='onClick'&&a.initializer&&ts.isJsxExpression(a.initializer)&&a.initializer.expression) handlerExpr=a.initializer.expression.getText(tree);
      ts.forEachChild(a,find);
    }
    find(n);
  }
  ts.forEachChild(n,walk);
}
walk(tree);
if(!handlerExpr)throw new Error('Premium handler not found');
const premiumCases=[];
for(const before of [false,true])for(const id of ['free','m','y','care']){
 const state={premium:before};
 const sandbox={id,st:state,setSt:fn=>fn(state),emit:()=>{},setToast:()=>{},buy:()=>{}};
 vm.runInNewContext(ts.transpileModule('globalThis.handler=('+handlerExpr+');',{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
 sandbox.handler();premiumCases.push({id,before,after:state.premium,unchanged:state.premium===before});
}
const menu=generateMenu(RECIPES,{mode:'keto',numDays:1,meals:3,profile:{},today:new Date(2026,9,26),random:()=>0});
const value=menu.days[0].slots.breakfast;
const replacements=replacementCandidates('k2',['k2'],RECIPES,{mode:'keto'},'breakfast');
const k2=RECIPES.find(r=>r.id==='k2');
const unknown={...k2,id:'synthetic_unknown',ing:[['Неизвестный состав соуса','20 г']]};
const out={
 scope:'Independent isolated probes of actual source; no browser or production data',
 premiumCases,
 menuContract:{slotValueType:typeof value,legacyIdLookupFound:!!RECIPES.find(r=>r.id===value),createdType:typeof menu.created,created:menu.created},
 replacement:{current:'k2',profileMode:'keto',candidateModes:[...new Set(replacements.map(r=>r.mode))],foreignModeCount:replacements.filter(r=>r.mode!=='keto').length},
 eligibility:{eggRecipeWithValidArray:isRecipeAllowed(k2,{allergies:['Яйца']}),eggRecipeWithMalformedString:isRecipeAllowed(k2,{allergies:'Яйца'}),unknownIngredientWithEggAllergy:isRecipeAllowed(unknown,{allergies:['Яйца']})},
 integration:{appStillDefinesRecipes:/const RECIPES\s*:\s*Recipe\[\]/.test(text),appImportsDomainMenu:/from\s*["'][^"']*domain\/menu["']/.test(text),appImportsNewCatalog:/from\s*["'][^"']*data\/recipes["']/.test(text)}
};
console.log(JSON.stringify(out,null,2));
fs.writeFileSync('C:/Users/HP/AppData/Local/hermes/cache/scratch/p05-p06-independent-probes.json',JSON.stringify(out,null,2));
