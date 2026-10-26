const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const req=createRequire('C:/Users/HP/Keto-balance/package.json');
const ts=req('typescript');
const file='C:/Users/HP/Keto-balance/src/App.tsx';
const text=fs.readFileSync(file,'utf8');
const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let expression;
function visit(n){
  if(ts.isJsxAttribute(n)&&n.name.getText(tree)==='onClick'&&n.initializer&&ts.isJsxExpression(n.initializer)&&n.initializer.expression){
    const candidate=n.initializer.expression.getText(tree);
    if(candidate.includes('s.premium = false'))expression=candidate;
  }
  ts.forEachChild(n,visit);
}
visit(tree);
if(!expression)throw new Error('Expected handler not found; source changed');
const state={premium:true};
const sandbox={id:'free',st:state,setSt:fn=>fn(state),emit:()=>{},setToast:()=>{},buy:()=>{throw new Error('Unexpected purchase');}};
const output=ts.transpileModule('globalThis.handler=('+expression+');',{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(output,sandbox);
sandbox.handler();
const result={scope:'Isolated execution of the actual onClick expression, not a browser E2E',before:true,after:state.premium,changed:state.premium!==true};
console.log(JSON.stringify(result,null,2));
fs.writeFileSync('C:/Users/HP/AppData/Local/hermes/cache/scratch/p04-premium-probe.json',JSON.stringify(result,null,2));
