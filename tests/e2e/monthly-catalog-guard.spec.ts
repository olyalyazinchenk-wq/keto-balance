import { test, expect, activateSyntheticPremium, passNewUserStartGate } from './pilot.fixture';

for (const [index, scenario] of ['empty', 'unrelated', 'inaccessible'].entries()) {
  test(`Monthly metadata ${scenario}: submit and rebuild preserve menu and shopping; retry recovers`, async ({ createSession }) => {
    const session = await createSession({ id: 9600 + index, first_name: 'MonthGuard' });
    const { page } = session;
    await activateSyntheticPremium(session);
    await page.goto('/');
    await passNewUserStartGate(page);
    await page.getByTestId('settings-days-month').click();
    await page.getByTestId('submit-settings-btn').click();
    await expect(page.getByTestId('food-today')).toBeVisible();
    const auth = await page.request.post('/api/session', { data: { init_data: session.initData } });
    const headers = { Authorization: `Bearer ${(await auth.json()).session_token}` };
    const read = async (url: string) => {
      const response = await page.request.get(url, { headers });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const beforeUser = await read('/api/user');
    const beforeShopping = await read('/api/shopping');
    const registry = await read('/api/catalogs');
    let restored = false;
    await page.route('**/api/catalogs', async route => {
      const catalogs = restored ? registry.catalogs : scenario === 'empty' ? [] :
        registry.catalogs.map((entry: any) => scenario === 'unrelated'
          ? { ...entry, catalog_month: '2099-01' } : { ...entry, accessible: false });
      await route.fulfill({ json: { catalogs } });
    });
    await page.reload();
    await expect(page.getByTestId('food-today')).toBeVisible();
    const writes: string[] = [];
    page.on('request', req => {
      if (req.method() === 'PUT' && /\/api\/(user|shopping)$/.test(req.url())) writes.push(req.url());
    });
    await page.getByTestId('bottom-nav-menu').click();
    await page.getByTestId('menu-rebuild-button').click();
    await expect(page.getByTestId('monthly-catalog-error')).toBeVisible();
    expect(writes).toEqual([]);
    expect(await read('/api/user')).toEqual(beforeUser);
    expect(await read('/api/shopping')).toEqual(beforeShopping);

    await page.getByTestId('bottom-nav-today').click();
    await page.getByTestId('home-open-settings-btn').click();
    await page.getByTestId('submit-settings-btn').click();
    await expect(page.getByTestId('settings-form-error')).toContainText('Прежний рацион и покупки сохранены');
    expect(writes).toEqual([]);
    expect(await read('/api/user')).toEqual(beforeUser);
    expect(await read('/api/shopping')).toEqual(beforeShopping);

    restored = true;
    await Promise.all([
      page.waitForResponse(res => res.url().endsWith('/api/catalogs')),
      page.getByTestId('retry-monthly-selection-btn').click(),
    ]);
    await page.getByTestId('submit-settings-btn').click();
    await expect(page.getByTestId('food-today')).toBeVisible();
    expect(writes.length).toBeGreaterThan(0);
    const recovered = await read('/api/user');
    expect(recovered.state.menu.month).toBe(beforeUser.state.menu.month);
    expect(recovered.state.menu.catalog_id).toBe(beforeUser.state.menu.catalog_id);
  });
}
