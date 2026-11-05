/**
 * Select an authentication source for Telegram Mini App bootstrap.
 * Keep the exact raw signed initData string: only the backend can validate it.
 * Demo identity is never allowed to override initData from Telegram.
 */
export interface TelegramLaunchAuth {
  initData: string;
  demoUserId: number | null;
}

function fragmentParams(hash: string): URLSearchParams {
  const clean = hash.replace(/^#/, '');
  // Native Telegram parameters may appear as #tgWebAppData=... or as #/route?tgWebAppData=....
  const question = clean.indexOf('?');
  const query = question >= 0 ? clean.slice(question + 1) : clean.replace(/^\/+/, '');
  return new URLSearchParams(query);
}

export function resolveTelegramLaunchAuth(
  telegramInitData?: string | null,
  search = '',
  hash = '',
): TelegramLaunchAuth {
  const query = new URLSearchParams(search.replace(/^\?/, ''));
  const fragment = fragmentParams(hash);
  const sources = [
    telegramInitData,
    fragment.get('tgWebAppData'),
    query.get('tgWebAppData'),
    query.get('init_data'),
  ];
  const found = sources.find((value): value is string =>
    typeof value === 'string' && value.trim().length > 0
  );
  const initData = found ? found.trim() : '';

  if (initData) {
    return { initData, demoUserId: null };
  }

  const rawDemoId = query.get('demo_user') ?? fragment.get('demo_user');
  if (!rawDemoId || !/^[1-9][0-9]{0,15}$/.test(rawDemoId)) {
    return { initData: '', demoUserId: null };
  }

  const demoUserId = Number(rawDemoId);
  if (!Number.isSafeInteger(demoUserId)) {
    return { initData: '', demoUserId: null };
  }
  return { initData: '', demoUserId };
}
