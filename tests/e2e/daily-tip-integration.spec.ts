import { test, expect, passNewUserStartGate } from './pilot.fixture';
test('new user opens built app and daily tip persists while navigating', async ({createSession}) => {
 const {page} = await createSession({id: 894402,first_name:'Test'});
 await page.setViewportSize({width:375,height:700});
 await page.goto('/');
 await passNewUserStartGate(page);
 await page.getByTestId('submit-settings-btn').click();
 const dialog=page.getByRole('dialog',{name:'Совет дня'});
 await expect(dialog).toBeVisible({timeout:15000});
 const tip=await dialog.locator('p').innerText();
 await dialog.getByRole('button',{name:'Понятно, закрыть'}).click();
 await expect(page.getByTestId('food-today')).toBeVisible();
 await page.getByTestId('bottom-nav-menu').click(); await expect(page.getByTestId('food-menu-screen')).toBeVisible();
 await page.getByTestId('bottom-nav-shopping').click(); await expect(page.getByTestId('food-shopping-screen')).toBeVisible();
 await page.getByTestId('bottom-nav-more').click(); await page.getByTestId('open-daily-tip').click();
 await expect(dialog.locator('p')).toHaveText(tip); await dialog.getByRole('button',{name:'Понятно, закрыть'}).click();
 await page.reload(); await expect(page.getByTestId('food-app-shell')).toBeVisible({timeout:15000}); await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
