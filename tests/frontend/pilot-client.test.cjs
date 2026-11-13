const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const { loadTs } = require(path.join(ROOT, 'tests/helpers/load-ts.cjs'));

const { KetoClient, UnauthorizedError, ConflictError, ApiError } = loadTs(
  path.join(ROOT, 'src/api/ketoClient.ts')
);

test('KetoClient Unit Tests', async (t) => {
  const originalFetch = global.fetch;

  t.afterEach(() => {
    global.fetch = originalFetch;
  });

  await t.test('protected calls without token immediately throw UnauthorizedError', async () => {
    const client = new KetoClient({ baseUrl: 'http://127.0.0.1:18080' });
    assert.equal(client.getToken(), null);

    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      return new Response('{}');
    };

    await assert.rejects(async () => {
      await client.getUser();
    }, UnauthorizedError);

    assert.equal(fetchCalled, false, 'fetch should not be called when token is missing');
  });

  await t.test('createSession sends init_data, stores token in memory, and returns session info', async () => {
    let requestedUrl = '';
    let requestedBody = '';

    global.fetch = async (url, options) => {
      requestedUrl = url;
      requestedBody = options.body;
      return new Response(JSON.stringify({
        session_token: 'secret_hex_token_123',
        user_id: 1001,
        first_name: 'TestUser'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const client = new KetoClient({ baseUrl: 'http://127.0.0.1:18080' });
    const session = await client.createSession('query_id=1&hash=valid');

    assert.equal(requestedUrl, 'http://127.0.0.1:18080/api/session');
    assert.deepEqual(JSON.parse(requestedBody), { init_data: 'query_id=1&hash=valid' });
    assert.equal(session.session_token, 'secret_hex_token_123');
    assert.equal(session.user_id, 1001);
    assert.equal(client.getToken(), 'secret_hex_token_123');
  });

  await t.test('401 response invokes onUnauthorized and clears token', async () => {
    let unauthorizedCount = 0;
    const client = new KetoClient({
      baseUrl: 'http://127.0.0.1:18080',
      onUnauthorized: () => { unauthorizedCount++; }
    });
    client.setToken('expired_token');

    global.fetch = async () => {
      return new Response(JSON.stringify({ detail: 'Session expired' }), { status: 401 });
    };

    await assert.rejects(async () => {
      await client.getUser();
    }, UnauthorizedError);

    assert.equal(unauthorizedCount, 1);
    assert.equal(client.getToken(), null);
  });

  await t.test('late anonymous catalog 401 cannot invalidate a newly created session', async () => {
    let unauthorizedCount = 0;
    let resolveCatalog;
    const catalogResponse = new Promise(resolve => { resolveCatalog = resolve; });
    const client = new KetoClient({ onUnauthorized: () => { unauthorizedCount++; } });
    global.fetch = async (url, options) => {
      if (url === '/api/catalogs') {
        assert.equal(new Headers(options.headers).get('Authorization'), null);
        return catalogResponse;
      }
      assert.equal(url, '/api/session');
      return new Response(JSON.stringify({ session_token: 'new-session-token', user_id: 1001 }), { status: 200 });
    };

    const staleCatalog = assert.rejects(client.listCatalogs(), UnauthorizedError);
    await client.createSession('synthetic-signed-data');
    resolveCatalog(new Response('{"detail":"Unauthorized"}', { status: 401 }));
    await staleCatalog;

    assert.equal(client.getToken(), 'new-session-token');
    assert.equal(unauthorizedCount, 0, 'an anonymous request has no session to invalidate');
  });

  await t.test('late 401 from an older authenticated request cannot clear the replacement token', async () => {
    let unauthorizedCount = 0;
    let resolveUser;
    const userResponse = new Promise(resolve => { resolveUser = resolve; });
    const client = new KetoClient({ onUnauthorized: () => { unauthorizedCount++; } });
    client.setToken('old-session-token');
    global.fetch = async (url, options) => {
      if (url === '/api/user') {
        assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer old-session-token');
        return userResponse;
      }
      assert.equal(url, '/api/session');
      return new Response(JSON.stringify({ session_token: 'replacement-session-token', user_id: 1001 }), { status: 200 });
    };

    const staleUser = assert.rejects(client.getUser(), UnauthorizedError);
    await client.createSession('synthetic-new-signed-data');
    resolveUser(new Response('{"detail":"Session expired"}', { status: 401 }));
    await staleUser;

    assert.equal(client.getToken(), 'replacement-session-token');
    assert.equal(unauthorizedCount, 0);
  });

  await t.test('catalog 401 still invalidates the current token when that token was sent', async () => {
    let unauthorizedCount = 0;
    const client = new KetoClient({ onUnauthorized: () => { unauthorizedCount++; } });
    client.setToken('expired-current-token');
    global.fetch = async (_url, options) => {
      assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer expired-current-token');
      return new Response('{"detail":"Session expired"}', { status: 401 });
    };

    await assert.rejects(client.listCatalogs(), UnauthorizedError);
    assert.equal(client.getToken(), null);
    assert.equal(unauthorizedCount, 1);
  });

  await t.test('concurrent 401 responses notify only once for the same expired session', async () => {
    let unauthorizedCount = 0;
    let resolveSecond;
    const secondResponse = new Promise(resolve => { resolveSecond = resolve; });
    const client = new KetoClient({ onUnauthorized: () => { unauthorizedCount++; } });
    client.setToken('expired-current-token');
    global.fetch = async url => url === '/api/user'
      ? new Response('{"detail":"Session expired"}', { status: 401 })
      : secondResponse;

    const first = assert.rejects(client.getUser(), UnauthorizedError);
    const second = assert.rejects(client.getShopping(), UnauthorizedError);
    await first;
    resolveSecond(new Response('{"detail":"Session expired"}', { status: 401 }));
    await second;

    assert.equal(client.getToken(), null);
    assert.equal(unauthorizedCount, 1);
  });

  await t.test('409 response throws ConflictError with server detail', async () => {
    const client = new KetoClient({ baseUrl: 'http://127.0.0.1:18080' });
    client.setToken('valid_token');

    global.fetch = async () => {
      return new Response(JSON.stringify({ detail: 'Stale revision: expected 0, but current is 1' }), { status: 409 });
    };

    await assert.rejects(async () => {
      await client.putUser({
        schema_version: 1,
        expected_revision: 0,
        profile: null,
        state: null
      });
    }, (err) => {
      assert.ok(err instanceof ConflictError);
      assert.match(err.message, /Stale revision/);
      return true;
    });
  });

  await t.test('network error throws ApiError with status 0', async () => {
    const client = new KetoClient({ baseUrl: 'http://127.0.0.1:18080' });
    global.fetch = async () => {
      throw new Error('Connection refused');
    };

    await assert.rejects(async () => {
      await client.getCatalog();
    }, (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 0);
      assert.match(err.message, /Network failure/);
      return true;
    });
  });

  await t.test('malformed JSON response throws ApiError', async () => {
    const client = new KetoClient({ baseUrl: 'http://127.0.0.1:18080' });
    global.fetch = async () => {
      return new Response('<html>Bad Gateway</html>', { status: 502 });
    };

    await assert.rejects(async () => {
      await client.getCatalog();
    }, (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 502);
      assert.match(err.message, /Malformed JSON/);
      return true;
    });
  });
});
