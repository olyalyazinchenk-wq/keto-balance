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
