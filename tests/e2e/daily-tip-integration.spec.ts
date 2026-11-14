import {test,expect,passNewUserStartGate} from './pilot.fixture';
test('tip opens on request, restores focus, and stays closed after navigation and reload',async({createSession})=>{
 const {page}=await createSession({id:894402,first_name:'Test'});
 await page.goto('/');await passNewUserStartGate(page);await page.getByTestId('submit-settings-btn').click();
 await expect(page.getByTestId('food-today')).toBeVisible();
 const dialog=page.getByRole('dialog',{name:'Совет дня'});
 await expect(dialog).toHaveCount(0);
 await page.getByTestId('bottom-nav-more').click();
 await page.getByTestId('open-daily-tip').click();await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await expect(page.getByTestId('open-daily-tip')).toBeFocused();
 await page.getByTestId('bottom-nav-today').click();
 await page.reload();await expect(page.getByTestId('food-today')).toBeVisible();await expect(dialog).toHaveCount(0);
});
