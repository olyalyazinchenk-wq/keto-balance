const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const root='C:/Users/HP/Keto-balance';
const run='C:/Users/HP/AppData/Local/hermes/cache/scratch/deepcoder-review-_yyezbxb';
const {chromium}=createRequire(root+'/package.json')('@playwright/test');
const receipt=JSON.parse(fs.readFileSync(run+'/receipt.json','utf8'));
const dist=receipt.results['isolated-build'].paths.dist_dir;
const cat=JSON.parse(fs.readFileSync(root+'/tests/fixtures/pilot/catalog.json','utf8'));
const pack=JSON.parse(fs.readFileSync(run+'/payloads.json','utf8'));
const origin='http://deepcoder-review.invalid',uid=9001;
const defaultUser=()=>({schema_version:1,user_id:uid,revision:4,profile:structuredClone(pack.profile),state:structuredClone(pack.state)});
(async()=>{
const browser=await chromium.launch({headless:true});
const result={scope:'Actual fresh built JS/CSS with private route-fulfilled/aborted synthetic API. Not a live server, native E2E or Telegram check.',build_id:receipt.results['isolated-build'].build_id};
try{
 async function setup({user=defaultUser(),catalog=cat,failUser=null,holdShopping=false}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>{window.__rejections=[];window.addEventListener('unhandledrejection',e=>window.__rejections.push(String(e.reason)));window.Telegram={WebApp:{initData:'synthetic-review-init',ready(){},expand(){}}};});
  const store={user:structuredClone(user),shop:{schema_version:1,user_id:uid,revision:2,items:structuredClone(pack.shop1)}};
  const calls=[];const controls={releaseShopping:null,held:false};
  await context.route('**/*',async route=>{
   const r=route.request(),url=new URL(r.url());
   if(url.origin!==origin){await route.abort();return;}
   if(url.pathname.startsWith('/api/')){
    let payload=null;try{payload=r.postDataJSON();}catch{}
    const call={method:r.method(),path:url.pathname,payload};calls.push(call);
    let status=200,body;
    if(url.pathname==='/api/session'||url.pathname==='/api/demo-session')body={session_token:'synthetic-review-session',user_id:uid};
    else if(url.pathname==='/api/catalog')body=catalog;
    else if(url.pathname==='/api/user'&&r.method()==='GET')body=store.user;
    else if(url.pathname==='/api/shopping'&&r.method()==='GET')body=store.shop;
    else if(url.pathname==='/api/user'&&r.method()==='PUT'){
     if(failUser==='network'){call.status='aborted';await route.abort('failed');return;}
     if(failUser==='conflict'||payload.expected_revision!==store.user.revision){status=409;body={detail:'Synthetic stale revision'};}
     else{store.user={...store.user,...payload,revision:store.user.revision+1};body={status:'ok',revision:store.user.revision};}
    }else if(url.pathname==='/api/shopping'&&r.method()==='PUT'){
     if(holdShopping&&!controls.held){controls.held=true;await new Promise(resolve=>controls.releaseShopping=resolve);}
     if(payload.expected_revision!==store.shop.revision){status=409;body={detail:'Synthetic stale shopping'};}
     else{store.shop={...store.shop,items:payload.items,revision:store.shop.revision+1};if(store.user.state?.menu)store.user.state.shopping_stale=true;body={status:'ok',revision:store.shop.revision};}
    }else{status=404;body={detail:'Unsupported review route'};}
    call.status=status;await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});return;
   }
   const rel=url.pathname==='/'?'index.html':url.pathname.slice(1);
   if(rel.includes('..')){await route.abort();return;}
   const file=path.join(dist,rel);if(!fs.existsSync(file)){await route.fulfill({status:404,body:''});return;}
   await route.fulfill({contentType:rel.endsWith('.js')?'application/javascript':rel.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);await page.goto(origin);return{context,page,calls,store,controls};
 }
 const invalidUser=defaultUser();invalidUser.profile.settings.prepTimeMax=1;
 const invalid=await setup({user:invalidUser});
 await invalid.page.locator('[data-testid="settings-form-error"]').waitFor();
 result.invalid_restore={settings_form_visible:await invalid.page.locator('[data-testid="pilot-settings-form"]').isVisible(),today_visible:await invalid.page.locator('[data-testid="food-today"]').isVisible(),confirmed18_preserved:await invalid.page.locator('[data-testid="settings-confirmed-18"]').isChecked(),error:await invalid.page.locator('[data-testid="settings-form-error"]').innerText(),unhandled:await invalid.page.evaluate(()=>window.__rejections)};
 await invalid.context.close();
 for(const kind of ['network','conflict']){
  const x=await setup({failUser:kind});
  await x.page.locator('[data-testid="food-today"]').waitFor();
  await x.page.locator('[data-testid="bottom-nav-menu"]').click();
  await x.page.locator('[data-testid="menu-day-tab-1"]').click();
  await x.page.waitForFunction(kind=>{const t=document.querySelector('[data-testid="pilot-sync-banner"]')?.textContent||'';return kind==='network'?t.includes('Ошибка синхронизации'):t.includes('Конфликт');},kind);
  const before=await x.page.locator('[data-testid="pilot-sync-banner"]').innerText();
  await x.page.locator('[data-testid="bottom-nav-shopping"]').click();
  await x.page.locator('[data-testid="shopping-add-custom-toggle-btn"]').click();
  await x.page.getByPlaceholder(/Кокосовые сливки/i).fill('Синтетический товар');
  await x.page.getByPlaceholder(/200 мл/i).fill('1 шт.');
  await x.page.getByRole('button',{name:'Сохранить в список',exact:true}).click();
  await x.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  result[kind+'_sticky']={before,after:await x.page.locator('[data-testid="pilot-sync-banner"]').innerText(),shopping_puts:x.calls.filter(c=>c.method==='PUT'&&c.path==='/api/shopping').length,unhandled:await x.page.evaluate(()=>window.__rejections)};
  await x.context.close();
 }
 // Existing nonzero revision: bootstrap duplicate repair must use that revision.
 const duplicateUser=defaultUser();duplicateUser.state.menu.days[0].slots={breakfast:'k1',lunch:'k1',dinner:'k1'};
 const duplicate=await setup({user:duplicateUser});
 await duplicate.page.locator('[data-testid="food-today"]').waitFor();
 await duplicate.page.waitForFunction(()=>!document.querySelector('[data-testid="pilot-sync-banner"]')?.textContent.includes('Сохранение изменений'));
 await duplicate.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 result.duplicate_restore={banner:await duplicate.page.locator('[data-testid="pilot-sync-banner"]').innerText(),user_puts:duplicate.calls.filter(c=>c.method==='PUT'&&c.path==='/api/user').map(c=>({expected_revision:c.payload?.expected_revision,status:c.status})),stored_first_day_ids:Object.values(duplicate.store.user.state.menu.days[0].slots),unhandled:await duplicate.page.evaluate(()=>window.__rejections)};
 await duplicate.context.close();

 const delayedUser=defaultUser();delayedUser.state.shopping_stale=true;
 const delayed=await setup({user:delayedUser,holdShopping:true});
 await delayed.page.locator('[data-testid="food-today"]').waitFor();
 await delayed.page.locator('[data-testid="bottom-nav-shopping"]').click();
 await Promise.all([
  delayed.page.waitForRequest(r=>r.url().endsWith('/api/shopping')&&r.method()==='PUT'),
  delayed.page.locator('[data-testid="shopping-refresh-btn"]').click()
 ]);
 await delayed.page.locator('[data-testid="shopping-add-custom-toggle-btn"]').click();
 const custom='Синтетический товар при обновлении';
 await delayed.page.getByPlaceholder(/Кокосовые сливки/i).fill(custom);
 await delayed.page.getByPlaceholder(/200 мл/i).fill('1 шт.');
 await delayed.page.getByRole('button',{name:'Сохранить в список',exact:true}).click();
 const visibleBefore=await delayed.page.getByText(custom,{exact:true}).count();
 const storedResponse=delayed.page.waitForResponse(r=>r.url().endsWith('/api/shopping')&&r.request().method()==='PUT'&&(r.request().postData()||'').includes(custom));
 if(typeof delayed.controls.releaseShopping!=='function')throw new Error('Delayed review request was not captured');
 delayed.controls.releaseShopping();
 const success=await storedResponse;
 await delayed.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 result.refresh_custom_item_interleaving={visible_before_release:visibleBefore,visible_after_success:await delayed.page.getByText(custom,{exact:true}).count(),shopping_save_status:success.status(),mock_backend_contains_custom_item:delayed.store.shop.items.some(i=>i.name===custom),unhandled:await delayed.page.evaluate(()=>window.__rejections)};
 await delayed.context.close();
}catch(e){result.harness_error=String(e);process.exitCode=1;}finally{await browser.close();}
fs.writeFileSync(run+'/ui-probes-full.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})();
