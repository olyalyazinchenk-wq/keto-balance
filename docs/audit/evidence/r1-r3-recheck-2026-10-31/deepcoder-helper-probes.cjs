const fs=require('node:fs');
const root='C:/Users/HP/Keto-balance';
const run='C:/Users/HP/AppData/Local/hermes/cache/scratch/deepcoder-review-_yyezbxb';
const {loadTs}=require(root+'/tests/helpers/load-ts.cjs');
const state=loadTs(root+'/src/adapters/pilotState.ts');
const {createMenuController}=loadTs(root+'/src/adapters/menuController.ts');
const {toRecipeViewModel}=loadTs(root+'/src/ui/food-first/recipesAdapter.ts');
const {rebuildShoppingFromMenu}=loadTs(root+'/src/ui/food-first/shoppingFromMenu.ts');
const catalog=JSON.parse(fs.readFileSync(root+'/tests/fixtures/pilot/catalog.json','utf8'));
const settings={confirmed18Plus:true,approach:'keto',restrictions:[],prepTimeMax:60,mealsPerDay:3,planDays:3,preferenceNote:'simple_daily'};
const profile=state.preferencesToUserProfile(settings);
const menu=createMenuController(catalog.recipes,catalog.released_ids,{isPreview:true}).createUserMenu({mode:'keto',numDays:3,meals:3,profile,random:()=>0,today:new Date(2026,9,31)});
const map=Object.fromEntries(catalog.recipes.map(r=>[r.id,toRecipeViewModel(r)]));
const baseState={schema_version:1,menu,selected_date:menu.days[0].date,checked_ingredients:{},checked_steps:{},shopping_batches:1,shopping_stale:false};
const pack={profile:{settings},state:baseState,shop1:rebuildShoppingFromMenu(menu,map,[],1),shop2:rebuildShoppingFromMenu(menu,map,[],2)};
const duplicate=structuredClone(menu);duplicate.days[0].slots={breakfast:'k1',lunch:'k1',dinner:'k1'};
let exploreRejected=false;try{state.approachToMode('explore');}catch{exploreRejected=true;}
const result={scope:'Actual unmodified helpers via project load-ts loader and own synthetic catalog; fixture quantity outputs are not approved nutrition data',empty_pool_rejected:!state.isMenuCompatibleWithProfile(menu,profile,catalog.recipes,[],false),duplicate_day_rejected:!state.isMenuCompatibleWithProfile(duplicate,profile,catalog.recipes,catalog.released_ids,true),explore_rejected:exploreRejected,shopping_payloads_generated:true};
fs.writeFileSync(run+'/payloads.json',JSON.stringify(pack,null,2));fs.writeFileSync(run+'/helper-probes.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
