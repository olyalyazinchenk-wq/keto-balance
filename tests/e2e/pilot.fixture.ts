import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import { createHmac } from 'node:crypto';

export const SYNTHETIC_SIGNING_KEY = 'synthetic-pilot-signing-key-not-a-telegram-token';

export function signTelegramInitData(
  user: { id: number; first_name: string; username?: string },
  botToken = SYNTHETIC_SIGNING_KEY
): string {
  const authDate = Math.floor(Date.now() / 1000);
  const userJson = JSON.stringify(user);

  const pairs = [`auth_date=${authDate}`, `user=${userJson}`];
  const dataCheckString = pairs.sort().join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('user', userJson);
  params.set('hash', hash);
  return params.toString();
}

export function createTelegramMockScript(
  initData: string,
  user: { id: number; first_name: string },
  theme: 'light' | 'dark' = 'light'
): string {
  const themeParams =
    theme === 'dark'
      ? {
          bg_color: '#0B1410',
          text_color: '#E8F1EC',
          hint_color: '#8A9E93',
          link_color: '#529E7A',
          button_color: '#255C48',
          button_text_color: '#FFFFFF',
          secondary_bg_color: '#12201A',
        }
      : {
          bg_color: '#F4F8F5',
          text_color: '#1C2821',
          hint_color: '#526159',
          link_color: '#255C48',
          button_color: '#255C48',
          button_text_color: '#FFFFFF',
          secondary_bg_color: '#FFFFFF',
        };

  return `
    (function() {
      const listeners = {
        themeChanged: [],
        viewportChanged: [],
      };

      const mockWebApp = {
        initData: ${JSON.stringify(initData)},
        initDataUnsafe: { user: ${JSON.stringify(user)} },
        ready: () => {},
        expand: () => {},
        close: () => {},
        themeParams: ${JSON.stringify(themeParams)},
        colorScheme: ${JSON.stringify(theme)},
        isExpanded: true,
        viewportHeight: 640,
        viewportStableHeight: 640,
        setHeaderColor: () => {},
        setBackgroundColor: () => {},
        BackButton: { isVisible: false, onClick: () => {}, offClick: () => {}, show: () => {}, hide: () => {} },
        MainButton: { isVisible: false, onClick: () => {}, offClick: () => {}, show: () => {}, hide: () => {}, setText: () => {} },
        HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {}, selectionChanged: () => {} },
        onEvent: (eventType, eventHandler) => {
          if (listeners[eventType]) {
            listeners[eventType].push(eventHandler);
          }
        },
        offEvent: (eventType, eventHandler) => {
          if (listeners[eventType]) {
            listeners[eventType] = listeners[eventType].filter(h => h !== eventHandler);
          }
        },
      };

      window.__mockTgThemeChange = function(newTheme) {
        mockWebApp.colorScheme = newTheme;
        mockWebApp.themeParams = newTheme === 'dark'
          ? {
              bg_color: '#0B1410',
              text_color: '#E8F1EC',
              hint_color: '#8A9E93',
              link_color: '#529E7A',
              button_color: '#255C48',
              button_text_color: '#FFFFFF',
              secondary_bg_color: '#12201A',
            }
          : {
              bg_color: '#F4F8F5',
              text_color: '#1C2821',
              hint_color: '#526159',
              link_color: '#255C48',
              button_color: '#255C48',
              button_text_color: '#FFFFFF',
              secondary_bg_color: '#FFFFFF',
            };
        listeners.themeChanged.forEach(fn => {
          try { fn(); } catch(e) { console.error(e); }
        });
      };

      const tgObj = {};
      Object.defineProperty(tgObj, 'WebApp', {
        get() {
          return mockWebApp;
        },
        set(val) {
          if (val && typeof val === 'object') {
            Object.assign(mockWebApp, val);
            mockWebApp.initData = ${JSON.stringify(initData)};
            mockWebApp.initDataUnsafe = { user: ${JSON.stringify(user)} };
          }
        },
        configurable: true,
      });

      Object.defineProperty(window, 'Telegram', {
        get() {
          return tgObj;
        },
        set(val) {
          if (val && typeof val === 'object') {
            Object.assign(tgObj, val);
          }
        },
        configurable: true,
      });
    })();
  `;
}

export interface AuthenticatedUserSession {
  page: Page;
  context: BrowserContext;
  initData: string;
  user: { id: number; first_name: string; username?: string };
}

/** Full-plan scenarios explicitly pay through the isolated demo API; public/free boundaries stay enabled. */
export async function activateSyntheticPremium(session: AuthenticatedUserSession): Promise<void> {
  const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:18080';
  const host = new URL(baseUrl).hostname;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw new Error('Synthetic payment fixtures require an isolated loopback test server.');
  const auth = await session.page.request.post(`${baseUrl}/api/session`, { data: { init_data: session.initData } });
  expect(auth.status()).toBe(200);
  const { session_token: token } = await auth.json();
  expect(token).toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };
  const purchase = await session.page.request.post(`${baseUrl}/api/subscription/purchase`, {
    headers, data: { product_id: 'sub_month', provider: 'demo' },
  });
  expect(purchase.status()).toBe(200);
  const order = await purchase.json();
  expect(order.demo_mode).toBe(true);
  const confirmation = await session.page.request.post(`${baseUrl}/api/subscription/confirm-demo`, {
    headers, data: { order_id: order.order_id },
  });
  expect(confirmation.status()).toBe(200);
  expect((await confirmation.json()).subscription.is_premium).toBe(true);
}

export const test = base.extend<{
  createSession: (
    user?: { id: number; first_name: string; username?: string },
    options?: { theme?: 'light' | 'dark'; viewport?: { width: number; height: number } }
  ) => Promise<AuthenticatedUserSession>;
}>({
  createSession: async ({ browser }, use) => {
    const contextsToClose: BrowserContext[] = [];

    await use(async (user = { id: 2001, first_name: 'SyntheticUserA' }, options) => {
      const context = await browser.newContext({
        viewport: options?.viewport,
        colorScheme: options?.theme || 'light',
      });
      contextsToClose.push(context);
      const initData = signTelegramInitData(user);
      await context.addInitScript(createTelegramMockScript(initData, user, options?.theme || 'light'));
      const page = await context.newPage();
      return { page, context, initData, user };
    });

    for (const ctx of contextsToClose) {
      try {
        await ctx.close();
      } catch {}
    }
  },
});

/**
 * Passes the Start Gate for a new user by checking both mandatory checkboxes
 * (age 18+ and personal data consent), ensuring the continue button is enabled,
 * clicking continue, and waiting for the settings form to appear or gate to detach.
 */
export async function passNewUserStartGate(page: Page): Promise<void> {
  const gateScreen = page.locator('[data-testid="start-gate-screen"]');
  await gateScreen.waitFor({ state: 'visible', timeout: 10000 });

  const ageCheckbox = page.locator('#gate-checkbox-age');
  const pdCheckbox = page.locator('#gate-checkbox-pd');
  const continueBtn = page.locator('#start-btn-continue');

  await ageCheckbox.check();
  await pdCheckbox.check();

  await expect(continueBtn).toBeEnabled();
  await continueBtn.click();

  const settingsForm = page.locator('[data-testid="pilot-settings-form"]');
  await Promise.race([
    settingsForm.waitFor({ state: 'visible', timeout: 10000 }),
    gateScreen.waitFor({ state: 'detached', timeout: 10000 }),
  ]);
}

export { expect };
