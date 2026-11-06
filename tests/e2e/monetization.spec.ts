import {test,expect,passNewUserStartGate} from './pilot.fixture';
async function ready(createSession:any,id:number){
 const {page}=await createSession({id,first_name:'SubscriptionTest'});
 await page.goto('/');await passNewUserStartGate(page);
 await page.getByTestId('submit-settings-btn').click();
 await expect(page.getByTestId('food-today')).toBeVisible();
 await page.getByTestId('bottom-nav-more').click();return page;
}
test('subscription terms open from More with the existing tariff',async({createSession})=>{
 const page=await ready(createSession,8101);
 await expect(page.getByText('Базовый доступ',{exact:true})).toBeVisible();
 await page.getByTestId('more-open-paywall-btn').click();
 await expect(page.getByTestId('paywall-modal')).toBeVisible();
 await expect(page.getByTestId('tariff-card-sub_month')).toContainText('Кето Баланс Premium');
});
test('synthetic payment updates access and persists after reload',async({createSession})=>{
 const page=await ready(createSession,8102);
 await page.getByTestId('more-open-paywall-btn').click();
 const [purchase,confirm]=await Promise.all([
  page.waitForResponse(r=>r.url().includes('/api/subscription/purchase')&&r.request().method()==='POST'),
  page.waitForResponse(r=>r.url().includes('/api/subscription/confirm-demo')&&r.request().method()==='POST'),
  page.getByTestId('paywall-buy-btn').click()
 ]);
 expect(purchase.status()).toBe(200);expect(confirm.status()).toBe(200);
 await expect(page.getByTestId('paywall-modal')).toBeHidden();
 await expect(page.getByText('Подписка активна',{exact:true})).toBeVisible();
 await page.reload();await page.getByTestId('bottom-nav-more').click();
 await expect(page.getByText('Подписка активна',{exact:true})).toBeVisible();
});
test('subscription dialog closes by button, Escape and backdrop',async({createSession})=>{
 const page=await ready(createSession,8103);
 for(const method of ['button','escape','backdrop']){
  await page.getByTestId('more-open-paywall-btn').click();
  await expect(page.getByTestId('paywall-modal')).toBeVisible();
  if(method==='button')await page.getByTestId('paywall-close-btn').click();
  if(method==='escape')await page.keyboard.press('Escape');
  if(method==='backdrop')await page.mouse.click(5,5);
  await expect(page.getByTestId('paywall-modal')).toBeHidden();
 }
});
