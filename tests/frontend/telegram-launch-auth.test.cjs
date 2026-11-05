const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('../helpers/load-ts.cjs');

const { resolveTelegramLaunchAuth } = loadTs('src/tma/launchAuth.ts');

test('native Telegram initData wins over demo_user and URL-supplied init_data', () => {
  const result = resolveTelegramLaunchAuth(
    'auth_date=123&hash=signed',
    '?demo_user=12345&init_data=forged',
    '#tgWebAppData=also-forged',
  );
  assert.deepEqual(result, { initData: 'auth_date=123&hash=signed', demoUserId: null });
});

test('signed Telegram hash launch wins over demo_user and preserves encoded initData', () => {
  const raw = 'user=%7B%22id%22%3A1%7D&auth_date=123&hash=abc';
  const result = resolveTelegramLaunchAuth(
    undefined,
    '?demo_user=777',
    '#tgWebAppData=' + encodeURIComponent(raw) + '&tgWebAppVersion=9.0',
  );
  assert.deepEqual(result, { initData: raw, demoUserId: null });
});

test('hash route can carry valid native init data; avoid treating hash navigation as auth', () => {
  const raw = 'auth_date=100&hash=xyz';
  assert.deepEqual(
    resolveTelegramLaunchAuth(undefined, '', '#/menu?tgWebAppData=' + encodeURIComponent(raw)),
    { initData: raw, demoUserId: null },
  );
  assert.deepEqual(resolveTelegramLaunchAuth(undefined, '', '#/menu'), {
    initData: '', demoUserId: null,
  });
});

test('untrusted or invalid demo IDs are rejected before any request', () => {
  for (const raw of ['abc', '0', '-1', '123abc', '9007199254740993', '']) {
    assert.deepEqual(
      resolveTelegramLaunchAuth('', '?demo_user=' + raw, ''),
      { initData: '', demoUserId: null },
      'must reject demo_user=' + raw,
    );
  }
  assert.deepEqual(resolveTelegramLaunchAuth(undefined, '?demo_user=222', ''), {
    initData: '', demoUserId: 222,
  });
});

test('URL query init_data remains backward compatible and must be validated server-side', () => {
  const initData = 'auth_date=99&hash=test-only';
  assert.deepEqual(
    resolveTelegramLaunchAuth(undefined, '?init_data=' + encodeURIComponent(initData), ''),
    { initData, demoUserId: null },
  );
});

test('bootstrap uses signed launch preference and mounts bridge with cleanup only', () => {
  const pilot = fs.readFileSync('src/PilotApp.tsx', 'utf8');
  const main = fs.readFileSync('src/main.tsx', 'utf8');
  assert.match(pilot, /resolveTelegramLaunchAuth\(/);
  assert.match(pilot, /if \(demoUserId !== null\)/);
  assert.match(main, /useEffect\(\(\) => \{[\s\S]*?setupTelegramApp\(\);[\s\S]*?return cleanup/);
  assert.equal((main.match(/setupTelegramApp\(\)/g) || []).length, 1);
});
